const gulp = require('gulp');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const rename = require('gulp-rename');

const jsFiles = [
  'src/core/commands.js',
  'src/core/plugin.js',
  'src/core/selection.js',
  'src/core/history.js',
  'src/editor.js',
  'src/plugins/toolbar.js',
  'src/plugins/basic-commands.js',
  'src/plugins/sanitizer.js',
  'src/plugins/preview.js',
  'src/plugins/normalizer.js',
  'src/plugins/link.js',
  'src/plugins/table.js',
  'src/plugins/image.js',
  'src/plugins/video.js',
  'src/plugins/fullscreen.js',
  'src/plugins/history.js',
  'src/plugins/codeview.js'
];

gulp.task('build', function() {
  return gulp.src(jsFiles)
    .pipe(concat('weaver-editor.js')) // Junta todos os arquivos em um só
    .pipe(gulp.dest('dist')) // Salva a versão Legível na pasta /dist
    .pipe(uglify()) // Esmaga o código (remove espaços e encurta variáveis)
    .pipe(rename('weaver-editor.min.js')) // Renomeia o arquivo
    .pipe(gulp.dest('dist')); // Salva a versão Minificada na pasta /dist
});

gulp.task('default', gulp.series('build'));