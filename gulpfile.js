var gulp = require('gulp'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    header = require('gulp-header'),
    rimraf = require('gulp-rimraf'),
    browserify = require('gulp-browserify'),
    docco = require('gulp-docco');

var pkg = require('./package.json');
var banner = ['/**',
 ' * <%= pkg.name %> v<%= pkg.version %>',
 ' * <%= pkg.description %>',
 ' * <%= pkg.homepage %>',
 ' *',
 ' * Copyright 2014 <%= pkg.author %>',
 ' * Released under the <%= pkg.license %> license',
 ' *',
 ' * Date: <%= date %>',
 ' */',
  ''].join('\n');
var minifiedBanner = '/** <%= pkg.name %> v<%= pkg.version %> | (c) 2014 <%= pkg.author %> | <%= pkg.license %> license */\n';

gulp.task('default', ['build', 'build:debug', 'build:slim', 'minify']);

gulp.task('build', function () {
  return gulp.src('lib/index.js', { read: false })
    .pipe(browserify({
      // debug: true,
      ignore: ['./utils-ext-globals'],
      standalone: 'sector'
    }))
    .pipe(header(banner, { pkg : pkg, date: new Date().toISOString() } ))
    .pipe(rename('sector.js'))
    .pipe(gulp.dest('dist'));
});

gulp.task('build:debug', function () {
  return gulp.src('lib/index.js', { read: false })
    .pipe(browserify({
      debug: true,
      ignore: ['./utils-ext-globals'],
      standalone: 'sector'
    }))
    .pipe(header(banner, { pkg : pkg, date: new Date().toISOString() } ))
    .pipe(rename('sector.debug.js'))
    .pipe(gulp.dest('dist'));
});

gulp.task('build:slim', function () {
  return gulp.src('lib/index.js', { read: false })
    .pipe(browserify({
      // debug: true,
      ignore: ['./utils-ext-require'],
      standalone: 'sector'
    }))
    .pipe(header(banner, { pkg : pkg, date: new Date().toISOString() } ))
    .pipe(rename('sector.slim.js'))
    .pipe(gulp.dest('dist'));
});

gulp.task('minify', ['build', 'build:debug', 'build:slim'], function () {
  return gulp.src(['dist/sector.js', 'dist/sector.debug.js', 'dist/sector.slim.js'])
    .pipe(uglify())
    .pipe(header(minifiedBanner, { pkg : pkg } ))
    .pipe(rename({suffix: '.min'}))
    .pipe(gulp.dest('dist'));
});

gulp.task('clean', function () {
  return gulp.src(['node_modules', 'dist/**/*']).pipe(rimraf());
});

gulp.task('watch', function () {
  return gulp.watch('lib/**/*.js', ['default']);
});

gulp.task('docs', function () {
  return gulp.src('lib/**/*.js')
    .pipe(docco())
    .pipe(gulp.dest('docs'));
});