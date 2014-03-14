var gulp = require('gulp'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    header = require('gulp-header');

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
var minBanner = '/** <%= pkg.name %> v<%= pkg.version %> | (c) 2014 <%= pkg.author %> | <%= pkg.license %> license */\n';

gulp.task('default', ['copy', 'min']);

gulp.task('copy', function () {
  return gulp.src('sector.js')
    .pipe(header(banner, { pkg : pkg, date: new Date().toISOString() } ))
    .pipe(gulp.dest('./dist'));
});

gulp.task('min', function () {
  return gulp.src('sector.js')
    .pipe(uglify())
    .pipe(header(minBanner, { pkg : pkg } ))
    .pipe(rename({suffix: '.min'}))
    .pipe(gulp.dest('./dist'));
});