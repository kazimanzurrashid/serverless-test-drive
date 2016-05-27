'use strict';

const gulp = require('gulp');
const config = require('./config');

const plugins = require('gulp-load-plugins')({
  pattern: [
    'gulp-*',
    'aws-sdk',
    'del',
    'mime-types',
    'opener'
  ]
});

plugins.awsSdk.config.update({region: config.aws.region});

gulp.task('jscs', () => {
  return gulp.src([
    config.paths.lambdaDirectory + '/**/*.js',
    config.paths.clientDirectory + '/**/*.js',
    './gulpfile.js'
  ])
    .pipe(plugins.jscs())
    .pipe(plugins.jscs.reporter());
});

gulp.task('eslint', () => {
  return gulp.src([
    config.paths.lambdaDirectory + '/**/*.js',
    config.paths.clientDirectory + '/**/*.js',
    './gulpfile.js'
  ])
    .pipe(plugins.eslint())
    .pipe(plugins.eslint.format())
    .pipe(plugins.eslint.failAfterError());
});

gulp.task('lint', ['jscs', 'eslint']);

gulp.task('clean', () => {
  return plugins.del(config.paths.tempDirectory);
});

gulp.task('lambda:build', ['clean', 'lint'], () => {
  const fs = require('fs');

  const zips = fs.readdirSync(config.paths.lambdaDirectory)
    .map((entry) => {
      return new Promise((resolve) => {
        return gulp.src(config.paths.lambdaDirectory + '/' + entry + '/**/*')
          .pipe(plugins.zip(entry + '.zip'))
          .pipe(gulp.dest(config.paths.tempDirectory + '/lambda'))
          .on('end', resolve);
      });
    });

  return Promise.all(zips);
});

gulp.task('buckets:create', () => {
  return getStack({name: config.aws.bucketsStackName})
    .then((stack) => {
      if (stack) {
        return;
      }
      return readFile(config.paths.cloudformationDirectory +
        '/buckets.template');
    })
    .then((content) => {
      if (content) {
        return validateTemplate(content.toString());
      }
    })
    .then((content) => {
      if (!content) {
        return;
      }

      return createStack(
        config.aws.bucketsStackName,
        content, [
          {
            ParameterKey: 'LambdaBucketName',
            ParameterValue: config.aws.lambdaBucket
          },
          {
            ParameterKey: 'SiteBucketName',
            ParameterValue: config.aws.siteBucket
          }
        ]);
    });
});

gulp.task('buckets:delete', () => {
  const emptyLambdaBucket = emptyBucket(config.aws.lambdaBucket);
  const emptySiteBucket = emptyBucket(config.aws.siteBucket);

  return Promise.all([emptyLambdaBucket, emptySiteBucket])
    .then(() => {
      return getStack({name: config.aws.bucketsStackName});
    })
    .then((stack) => {
      if (!stack) {
        return;
      }
      return deleteStack(stack.StackId, config.aws.bucketsStackName);
    });
});

gulp.task('lambda:upload', ['lambda:build', 'buckets:create'], () => {
  return uploadDirectory(
    config.paths.tempDirectory + '/lambda',
    config.aws.lambdaBucket,
    true);
});

gulp.task('stack:up', ['lambda:upload'], () => {
  return readFile(config.paths.cloudformationDirectory  + '/stack.template')
    .then((content) => {
      return validateTemplate(content.toString());
    })
    .then((content) => {
      return getStack({name: config.aws.mainStackName}).then((stack) => {
        return {
          stack: stack,
          template: content
        };
      });
    })
    .then((result) => {
      const params = [
          {
            ParameterKey: 'S3BucketName',
            ParameterValue: config.aws.lambdaBucket
          }
        ];

      if (result.stack) {
        return updateStack(
          result.stack.StackId,
          config.aws.mainStackName,
          result.template,
          params);
      }

      return createStack(
        config.aws.mainStackName,
        result.template,
        params);
    })
    .then((stack) => {
      return getApiId(stack);
    }).then((apiId) => {
      return deployApi(apiId);
    });
});

gulp.task('client:upload', ['stack:up'], () => {
  return getStack({name: config.aws.mainStackName})
    .then((stack) => {
      return getApiId(stack);
    })
    .then((apiId) => {
      return copyClientFiles(apiId);
    })
    .then(() => {
      return uploadDirectory(
        config.paths.tempDirectory + '/client',
        config.aws.siteBucket,
        false);
    })
    .then(() => {
      return plugins.opener(
        'http://' +
        config.aws.siteBucket +
        '.s3-website-' +
        config.aws.region +
        '.amazonaws.com');
    });
});

gulp.task('stack:down', ['clean', 'buckets:delete'], () => {
  return getStack({name: config.aws.mainStackName}).then((stack) => {
    if (stack) {
      return deleteStack(stack.StackId, config.aws.mainStackName);
    }
  });
});

gulp.task('default', ['client:upload']);

function readFile(location) {
  const fs = require('fs');

  return new Promise((resolve, reject) => {
    fs.readFile(location, (err, content) => {
      if (err) {
        return reject(err);
      }
      return resolve(content);
    });
  });
}

function copyClientFiles(apiId) {
  return new Promise((resolve) => {
    const jsFiles = plugins.filter('**/*.js', {restore: true});
    const htmlFiles = plugins.filter('**/*.html', {restore: true});

    return gulp.src(config.paths.clientDirectory + '/**')
      .pipe(jsFiles)
      .pipe(plugins.replace('{{API-ID}}', apiId))
      .pipe(plugins.sourcemaps.init())
      .pipe(plugins.uglify())
      .pipe(plugins.sourcemaps.write('./'))
      .pipe(jsFiles.restore)
      .pipe(htmlFiles)
      .pipe(plugins.htmlmin({
        minifyCSS: true,
        collapseWhitespace: true,
        removeComments: true
      }))
      .pipe(htmlFiles.restore)
      .pipe(gulp.dest(config.paths.tempDirectory + '/client'))
      .on('end', resolve);
  });
}

function uploadDirectory(location, bucket, local) {
  const fs = require('fs');

  const uploads = fs.readdirSync(location)
    .map((entry) => {
      return new Promise((resolve, reject) => {
        return readFile(location + '/' + entry)
          .then((content) => {
            const s3 = new plugins.awsSdk.S3();
            const params = {
              Bucket: bucket,
              Key: entry,
              Body: content,
              ACL: local ? 'private' : 'public-read',
              ContentType: plugins.mimeTypes.lookup(entry)
            };

            s3.putObject(params, (err) => {
              if (err) {
                return reject(err);
              }
              resolve();
            });

          }, (err) => {
            reject(err);
          });
      });
    });

  return Promise.all(uploads);
}

function emptyBucket(bucket) {
  return new Promise((resolve, reject) => {
    const s3 = new plugins.awsSdk.S3();
    let nextMarker;

    const deleteObjects = (callback) => {
      s3.listObjects({
        Bucket: bucket,
        Marker: nextMarker
      }, (listErr, listResponse) => {
        if (listErr) {
          return callback(listErr);
        }

        const objects = listResponse.Contents.map((content) => {
          return {
            Key: content.Key
          };
        });

        if (!objects.length) {
          return callback();
        }

        nextMarker = listResponse.IsTruncated ?
          objects[objects.length - 1].Key :
          void(0);

        s3.deleteObjects({
          Bucket: bucket,
          Delete: {
            Objects: objects
          }
        }, (deleteErr) => {
          if (deleteErr) {
            return callback(deleteErr);
          }

          if (!nextMarker) {
            return callback();
          }

          deleteObjects(callback);
        });
      });
    };

    s3.headBucket({
      Bucket: bucket
    }, (headErr) => {
      if (headErr) {
        return resolve(headErr);
      }
      deleteObjects((deleteErr) => {
        if (deleteErr) {
          return reject(deleteErr);
        }
        return resolve();
      });
    });
  });
}

function validateTemplate(content) {
  return new Promise((resolve, reject) => {
    const cfn = new plugins.awsSdk.CloudFormation();
    cfn.validateTemplate({
      TemplateBody: content
    }, (err) => {
      if (err) {
        return reject(err);
      }
      resolve(content);
    });
  });
}

function getStack(options) {
  return new Promise((resolve, reject) => {
    const cfn = new plugins.awsSdk.CloudFormation();
    let nextToken;

    const load = () => {
      cfn.describeStacks({
        NextToken: nextToken
      }, (err, response) => {
        if (err) {
          return reject(err);
        }

        nextToken = response.NextToken;

        if (!response.Stacks || !response.Stacks.length) {
          if (nextToken) {
            return load();
          }
          return resolve();
        }

        const match = response.Stacks.find((s) => {
          let found = false;

          if (options.name) {
            found = s.StackName === options.name;
          }

          if (options.id) {
            found = s.StackId === options.id;
          }

          return found;
        });

        if (match) {
          return resolve(match);
        }

        if (nextToken) {
          return load();
        }

        resolve();
      });
    };

    return load();
  });
}

function createStack(name, template, parameters) {
  return new Promise((resolve, reject) => {
    const params = {
      StackName: name,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: parameters,
      TemplateBody: template
    };

    const cfn = new plugins.awsSdk.CloudFormation();

    return cfn.createStack(params, (err, response) => {
      if (err) {
        return reject(err);
      }
      return pollStackStatus(response.StackId, name, resolve, reject);
    });
  });
}

function updateStack(id, name, template, parameters) {
  return new Promise((resolve, reject) => {
    const params = {
      StackName: id || name,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: parameters,
      TemplateBody: template
    };

    const cfn = new plugins.awsSdk.CloudFormation();

    cfn.updateStack(params, (err) => {
      if (err &&
        err.code !== 'ValidationError' &&
        err.message !== 'No updates are to be performed.') {
        return reject(err);
      }
      return pollStackStatus(id, name, resolve, reject);
    });
  });
}

function deleteStack(id, name) {
  new Promise((resolve, reject) => {
    const cfn = new plugins.awsSdk.CloudFormation();

    cfn.deleteStack({StackName: id || name}, (err) => {
      if (err) {
        return reject(err);
      }
      return pollStackStatus(id, name, resolve, reject);
    });
  });
}

function pollStackStatus(id, name, resolve, reject) {
  const poll = () => {
    setTimeout(() => {
      return getStack({id: id, name: name}).then((stack) => {

        if (!stack || !stack.StackStatus) {
          return poll();
        }

        switch (stack.StackStatus) {
          case 'CREATE_COMPLETE':
          case 'UPDATE_COMPLETE':
          case 'DELETE_COMPLETE': {
            return resolve(stack);
          }
          case 'CREATE_IN_PROGRESS':
          case 'UPDATE_IN_PROGRESS':
          case 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS':
          case 'DELETE_IN_PROGRESS': {
            return poll();
          }
          case 'CREATE_FAILED':
          case 'ROLLBACK_IN_PROGRESS':
          case 'ROLLBACK_FAILED':
          case 'ROLLBACK_COMPLETE':
          case 'UPDATE_ROLLBACK_COMPLETE':
          case 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS':
          case 'UPDATE_ROLLBACK_FAILED':
          case 'UPDATE_ROLLBACK_IN_PROGRESS':
          case 'DELETE_FAILED': {
            return reject(stack.StackStatusReason);
          }
          default: {
            throw new Error(`Unhandled stack status: ${stack.StackStatus}`);
          }
        }
      }, (err) => {
        return reject(err);
      });
    }, 1000 * 15);
  };

  poll();
}

function getApiId(stack) {
  var output = stack.Outputs.find((o) => {
    return o.OutputKey === 'ApiId';
  });

  return Promise.resolve(output.OutputValue);
}

function deployApi(apiId) {
  return new Promise((resolve, reject) => {
    const api = new plugins.awsSdk.APIGateway();
    api.createDeployment({
      restApiId: apiId,
      stageName: config.aws.deploymentStageName
    }, (err) => {
      if (err) {
        return reject(err);
      }
      resolve(apiId);
    });
  });
}
