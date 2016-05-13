'use strict';

const gulp = require('gulp');
const config = require('./config');

const plugins = require('gulp-load-plugins')({
  pattern: [
    'gulp-*',
    'del'
  ]
});

gulp.task('jscs', () => {
  return gulp.src(config.paths.lambdaDirectory + '/**/*.js')
    .pipe(plugins.jscs())
    .pipe(plugins.jscs.reporter());
});

gulp.task('eslint', () => {
  return gulp.src(config.paths.lambdaDirectory + '/**/*.js')
    .pipe(plugins.eslint())
    .pipe(plugins.eslint.format())
    .pipe(plugins.eslint.failAfterError());
});

gulp.task('lint', ['jscs', 'eslint']);

gulp.task('clean', () => {
  return plugins.del(config.paths.distDirectory);
});

gulp.task('build', ['clean', 'lint'], () => {
  const fs = require('fs');

  return new Promise((resolve) => {
    fs.readdirSync(config.paths.lambdaDirectory)
      .forEach((entry) => {
        gulp.src(config.paths.lambdaDirectory + '/' + entry + '/**/*')
          .pipe(plugins.zip(entry + '.zip'))
          .pipe(gulp.dest(config.paths.distDirectory + '/lambda'))
          .on('end', () => {
            resolve();
          });
      });
  });
});

gulp.task('upload', ['build'], () => {
  return gulp.src(config.paths.distDirectory + '/lambda/**')
    .pipe(plugins.s3Upload({useIAM: true})({
      Bucket: config.aws.lambdaBucket
    }));
});
