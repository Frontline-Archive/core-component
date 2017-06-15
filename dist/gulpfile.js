'use strict';

module.exports = function ( gulp, karma ) {
	var concat        = require( 'gulp-concat' );
	var clean         = require( 'gulp-clean' );
	var uglify        = require( 'gulp-uglify' );
	var less          = require( 'gulp-less' );
	var minifyCSS     = require( 'gulp-minify-css' );
	var concatCSS     = require( 'gulp-concat-css' );
	var annotate      = require( 'gulp-ng-annotate' );
	var wrap          = require( 'gulp-wrap-js' );
	var protractor    = require( 'gulp-protractor' ).protractor;
	var exec          = require( 'child_process' ).exec;
	var bump          = require( 'gulp-bump' );
	var argv          = require( 'yargs' ).argv;
	var git           = require( 'gulp-git' );
	var fs            = require( 'fs' );
	var path          = require( 'path' );
	var runSequence   = require('run-sequence').use( gulp );

	var distDir = 'dist';

	function cleanDist () {
		return gulp.src( './dist/*.*' )
			.pipe( clean( { 'force' : true } ) );
	}

	function js () {
		return gulp.src( [
			/**
			 * App
			 */
			'src/app/*.module.js',
			'src/app/**/*.module.js',
			'src/app/**/*.js',

			// lib
			'src/lib/*.js',

			/**
			 * Ignore
			 */
			'!src/app/core.module.js',
			'!src/app/**/test/*.js'
		] )
			.pipe( annotate() )
			.pipe( concat( 'main.js' ) )
			.pipe( gulp.dest( path.join( process.cwd(), distDir ) ) );
	}

	function jsWrap () {
		return gulp.src( [ 'dist/*.js' ] )
			.pipe( concat( 'main.tmp.js' ) )
			.pipe( wrap( 'define( [ \'angular\', \'ngMarionetteCore\' ], function ( angular ) {\'use strict\';%= body %})' ) )
			.pipe( concat( 'main.min.js' ) )
			.pipe( uglify() )
			.pipe( gulp.dest( path.join( process.cwd(), distDir ) ) );
	}

	function cssLess () {
		return gulp.src( [
			'src/less/*.less',
			'!src/less/style.less',
			'!src/less/sinet.less'
		] )
			.pipe( concat( 'style.less' ) )
			.pipe( gulp.dest( path.join( process.cwd(), distDir ) ) );
	}

	function css () {
		return gulp.src( [
			'dist/style.less'
		] )
			.pipe( less() )
			.pipe( concatCSS( 'style.min.css' ) )
			.pipe( minifyCSS() )
			.pipe( gulp.dest( path.join( process.cwd(), distDir ) ) );
	}

	function e2e () {
		return gulp.src( [ './features/steps.js' ] ).pipe( protractor( {
			'configFile' : './protractor.config.js',
			'args'       : [ '--baseUrl', 'http://127.0.0.1:8082' ]
		} ) ).on( 'error', function ( e ) {
			throw e;
		} );
	}

	function copyE2eTemplate () {
		return gulp.src(
			[
				'./node_modules/@sinet/core-component/dist/test-report-template/**/*.*',
				'./node_modules/@sinet/core-component/dist/test-report-template/**/*',
				'./node_modules/@sinet/core-component/dist/test-report-template/*'
			],
			{ 'base' : './node_modules/@sinet/core-component/dist/test-report-template' }
		).pipe( gulp.dest( './coverage/e2e' ) );
	}

	function cleanE2e () {
		return gulp.src( [ 'coverage/e2e/*.*', 'coverage/e2e/**/*.*', 'coverage/e2e/**/*' ] )
			.pipe( clean( { 'force' : true } ) );
	}

	function unitTest ( done ) {
		karma.start( {
			'configFile' : path.join( process.cwd(), '/karma.conf.js' ),
			'singleRun'  : true
		}, done );
	}

	function npmBuild ( done ) {
		git.exec( { 'args' : 'log -n 1 --pretty=format:"%s"' }, function ( err, commit ) {
			if ( commit.match( /(chore: bump to v)[0-9]+(.[0-9]+){2}$/ ) && !( process.env.CI_PULL_REQUEST || '' ).replace( /\s/g, '' ).length ) {
				var child = exec( 'npm publish' );

				child.stdout.on( 'data', console.log );
				child.stderr.on( 'data', console.log );

				child.on( 'close', function () {
					// never pass any argument to `done` to allow ci to pass always
					done();
				} );
			}
		} );
	}

	function getCurrentVersion () {
		return JSON.parse( fs.readFileSync( './package.json' ) ).version
	}

	function updateFiles () {
		var version   = getCurrentVersion();
		var readMe    = String( fs.readFileSync( './README.md' ) ).replace( /version-v[0-9]+(.[0-9]*){2}/g, 'version-v' + version );
		var appModule = String( fs.readFileSync( './src/app/app.module.js' ) ).replace( /\'[0-9]+(.[0-9]*){2}\'/g, '\'' + version + '\'' );

		fs.writeFileSync( './README.md', readMe );
		fs.writeFileSync( './src/app/app.module.js', appModule );
	}

	function bumpBuild () {
		var bumpType = argv.type;
		var type     = null;

		if ( bumpType ) {
			type = { 'type' : bumpType };
		}

		return gulp.src( './package.json' )
			.pipe( bump( type ) )
			.pipe( gulp.dest( './' ) );
	}

	function addAll () {
		return gulp.src( '.' ).pipe( git.add() );
	}

	function commit () {
		return gulp.src('.').pipe( git.commit( 'chore: bump to v' + getCurrentVersion() ) );
	}

	function bumpSequence ( done ) {
		runSequence( 'bumpBuild', 'updateFiles', 'build', 'addToCommit', 'commit', done );
	}

	// Dist cleanup
	gulp.task( 'clean:dist', cleanDist );

	// JS concatination and uglification after dist cleanup
	gulp.task( 'js', [ 'clean:dist' ], js );

	// build add require wrapper for use in pd360-html
	gulp.task( 'js:wrap', [ 'js', 'template', 'clean:dist' ], jsWrap );

	// css build
	gulp.task( 'css:less', [ 'clean:dist' ], cssLess );

	// css minification
	gulp.task( 'css', [ 'css:less', 'clean:dist' ], css );

	// build for release
	gulp.task( 'build', [ 'js:wrap', 'css', 'clean:dist' ] );

	// Run unit test
	gulp.task( 'unit', unitTest );

	// e2e cleanup
	gulp.task( 'clean:e2e', cleanE2e );

	// wrap protractor coverage json with template
	gulp.task( 'copy-e2e-report-template', [ 'clean:e2e' ], copyE2eTemplate );

	// Run e2e test
	gulp.task( 'e2e', [ 'copy-e2e-report-template', 'clean:e2e' ], e2e );

	// Run test once and exit
	gulp.task( 'test', [ 'unit', 'e2e' ] );

	// tasks for automating bump with commit
	// adds all changes
	gulp.task( 'addToCommit', addAll );
	// updates readme and app.module
	gulp.task( 'updateFiles', updateFiles );
	// creates commit for bump
	gulp.task('commit', commit );
	// bump package version
	gulp.task( 'bumpBuild', bumpBuild );
	// bump and commit
	gulp.task( 'bump', bumpSequence);

	// publish bumped version to npm
	gulp.task( 'publish', npmBuild );
};
