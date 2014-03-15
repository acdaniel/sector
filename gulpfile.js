var gulp = require('gulp'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    wrap = require('gulp-wrap'),
    concat = require('gulp-concat');

var pkg = require('./package.json');
var src = ['src/core.js', 'src/mixins/*.js', 'src/components/*.js'];

gulp.task('default', ['build', 'min']);

gulp.task('build', function () {
  return gulp.src(src)
    .pipe(concat('sector.js'))
    .pipe(wrap({ src: 'src/_wrapper.js'}, { pkg : pkg, date: new Date().toISOString() }))
    .pipe(gulp.dest('dist'));
});

gulp.task('min', ['build'], function () {
  return gulp.src('dist/sector.js')
    .pipe(uglify())
    .pipe(wrap({ src: 'src/_wrapper.min.js'}, { pkg : pkg, date: new Date().toISOString() }))
    .pipe(rename({suffix: '.min'}))
    .pipe(gulp.dest('dist'));
});