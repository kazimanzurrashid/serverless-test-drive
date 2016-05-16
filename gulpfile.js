'use strict';

const gulp = require('gulp');
const config = require('./config');

const plugins = require('gulp-load-plugins')({
  pattern: [
    'gulp-*',
    'del',
    'aws-sdk'
  ]
});

const distLambdaDirectory = config.paths.distDirectory + '/lambda';

plugins.awsSdk.config.update({region: config.aws.region});

gulp.task('jscs', () => {
  return gulp.src([
    config.paths.lambdaDirectory + '/**/*.js',
    './gulpfile.js'
  ])
    .pipe(plugins.jscs())
    .pipe(plugins.jscs.reporter());
});

gulp.task('eslint', () => {
  return gulp.src([
    config.paths.lambdaDirectory + '/**/*.js',
    './gulpfile.js'
  ])
    .pipe(plugins.eslint())
    .pipe(plugins.eslint.format())
    .pipe(plugins.eslint.failAfterError());
});

gulp.task('lint', ['jscs', 'eslint']);

gulp.task('lambda:clean', () => {
  return plugins.del(distLambdaDirectory);
});

gulp.task('lambda:build', ['lambda:clean'], () => {
  const fs = require('fs');

  const promises = fs.readdirSync(config.paths.lambdaDirectory)
    .map((entry) => {
      return new Promise((resolve) => {
        return gulp.src(config.paths.lambdaDirectory + '/' + entry + '/**/*')
          .pipe(plugins.zip(entry + '.zip'))
          .pipe(gulp.dest(distLambdaDirectory))
          .on('end', () => {
            resolve();
          });
      });
    });

  return Promise.all(promises);
});

gulp.task('lambda:bucket:create', () => {
  return bucketExists(config.aws.lambdaBucket)
    .then((exists) => {
      if (!exists) {
        return createBucket(config.aws.lambdaBucket);
      }
    })
    .catch((err) => {
      throw err;
    });
});

gulp.task('lambda:upload', ['lambda:build', 'lambda:bucket:create'], () => {
  const fs = require('fs');
  const uploads = fs.readdirSync(distLambdaDirectory)
    .map((entry) => {
      return upload(
        config.aws.lambdaBucket,
        entry,
        distLambdaDirectory + '/' + entry);
    });

  return Promise.all(uploads);
});

gulp.task('lambda:bucket:delete', () => {
  return bucketExists(config.aws.lambdaBucket)
    .then((exists) => {
      if (exists) {
        return deleteBucket(config.aws.lambdaBucket);
      }
    })
    .catch((err) => {
      throw err;
    });
});

gulp.task('stack:up', ['lambda:upload'], () => {
  return readFile('./stack.template')
    .then((content) => {
      return validateTemplate(content);
    })
    .then((content) => {
      return getStack().then((stack) => {
        return {
          stack: stack,
          template: content
        };
      });
    })
    .then((result) => {
      if (result.stack) {
        return updateStack(result.stack.StackId, result.template);
      }
      return createStack(result.template);
    })
    .then((apiId) => {
      console.log('ApiId: ', apiId);
    })
    .catch((err) => {
      throw err;
    });
});

gulp.task('stack:down', ['lambda:bucket:delete'], () => {
  return getStack().then((stack) => {
    if (stack) {
      return deleteStack(stack.StackId);
    }
  })
  .catch((err) => {
    throw err;
  });
});

function readFile(location) {
  const fs = require('fs');

  return new Promise((resolve, reject) => {
    fs.readFile(location, 'utf-8', (err, content) => {
      if (err) {
        return reject(err);
      }
      return resolve(content);
    });
  });
}

function bucketExists(bucket) {
  return new Promise((resolve) => {
    const s3 = new plugins.awsSdk.S3();
    s3.headBucket({
      Bucket: bucket
    }, (err) => {
      if (err) {
        return resolve(false);
      }
      resolve(true);
    });
  });
}

function createBucket(bucket) {
  return new Promise((resolve, reject) => {
    const s3 = new plugins.awsSdk.S3();
    s3.createBucket({
      Bucket: bucket
    }, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function upload(bucket, key, location) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    fs.readFile(location, (readErr, data) => {
      if (readErr) {
        return reject(readErr);
      }

      const s3 = new plugins.awsSdk.S3();
      s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: data
      }, (putErr) => {
        if (putErr) {
          return reject(putErr);
        }
        resolve();
      });
    });
  });
}

function deleteBucket(bucket) {
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

    deleteObjects((deleteObjectErr) => {
      if (deleteObjectErr) {
        return reject(deleteObjectErr);
      }
      s3.deleteBucket({
        Bucket: bucket
      }, (deleteBucketErr) => {
        if (deleteBucketErr) {
          return reject(deleteBucketErr);
        }
        resolve();
      });
    });
  });
}

function validateTemplate(content) {
  return new Promise((resolve, reject) => {
    const cfn = new plugins.awsSdk.CloudFormation();
    cfn.validateTemplate({TemplateBody: content}, (err) => {
      if (err) {
        return reject(err);
      }
      resolve(content);
    });
  });
}

function getStack(id) {
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
          return s.StackName === config.aws.cloudformationStackName &&
            (!id || s.StackId === id);
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

function createStack(template) {
  return new Promise((resolve, reject) => {
    const params = {
      StackName: config.aws.cloudformationStackName,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        {
          ParameterKey: 'S3Bucket',
          ParameterValue: config.aws.lambdaBucket
        }
      ],
      TemplateBody: template
    };

    const cfn = new plugins.awsSdk.CloudFormation();

    cfn.createStack(params, (err, response) => {
      if (err) {
        return reject(err);
      }
      return pollStackStatus(response.StackId, resolve, reject);
    });
  });
}

function updateStack(id, template) {
  return new Promise((resolve, reject) => {
    const params = {
      StackName: id,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        {
          ParameterKey: 'S3Bucket',
          ParameterValue: config.aws.lambdaBucket
        }
      ],
      TemplateBody: template
    };

    const cfn = new plugins.awsSdk.CloudFormation();

    cfn.updateStack(params, (err) => {
      if (err) {
        if (err.code === 'ValidationError' &&
          err.message === 'No updates are to be performed.') {
          return resolve();
        }
        return reject(err);
      }
      return pollStackStatus(id, resolve, reject);
    });
  });
}

function deleteStack(id) {
  new Promise((resolve, reject) => {
    const params = {
      StackName: id
    };

    const cfn = new plugins.awsSdk.CloudFormation();

    cfn.deleteStack(params, (err) => {
      if (err) {
        return reject(err);
      }
      return pollStackStatus(id, resolve, reject);
    });
  });
}

function pollStackStatus(id, resolve, reject) {
  
  const getApiId = (stack) => {
    var output = stack.Outputs.find((o) => {
      return o.OutputKey === 'ApiId';
    });
    return output.OutputValue;
  };

  const poll = () => {
    setTimeout(() => {
      return getStack(id).then((stack) => {

        if (!stack || !stack.StackStatus) {
          return poll();
        }

        switch (stack.StackStatus) {
          case 'CREATE_COMPLETE':
          case 'UPDATE_COMPLETE':
          case 'DELETE_COMPLETE': {
            var apiId = getApiId(stack);
            
            return resolve(apiId);
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
    }, 1000 * 10);
  };

  poll();
}

