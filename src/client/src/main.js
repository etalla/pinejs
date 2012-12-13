require({
	config: {
		has: {
			SBVR_EXTENSIONS: true
		}
	},
	paths: {
		//Developing & building tools
		'cs'                       :  '../tools/requirejs-plugins/cs',
		'cjs'                      :  '../tools/requirejs-plugins/cjs',
		'ometa'                    :  '../tools/requirejs-plugins/ometa',
		'dust'                     :  '../tools/requirejs-plugins/dust',
		'text'                     :  '../tools/requirejs-plugins/text',
		'coffee-script'            :  '../tools/coffee-script',
		'dust-full'                :  '../tools/dust-full',
		'has'                      :  '../../tools/has',

		'lib'                      :  '../lib',

		//Libraries
		'dust-core'                :  '../lib/dust-core',
		'backbone'                 :  '../lib/backbone',
		'bootstrap'                :  '../lib/bootstrap/bootstrap',
		'codemirror'               :  '../lib/codemirror/codemirror',
		'codemirror-ometa-bridge'  :  '../lib/codemirror-ometa-bridge/src',
		'codemirror-simple-hint'   :  '../lib/codemirror/util/simple-hint',
		'd3'                       :  '../lib/d3.v2',
		'inflection'               :  '../../external/inflection/inflection',
		'jquery'                   :  '../lib/jquery',
		'jquery-xdomain'           :  '../lib/jquery-xdomain',
		'ometa-compiler'           :  '../../external/ometa-js/lib/ometajs/ometa/parsers',
		'ometa-core'               :  '../../external/ometa-js/lib/ometajs/core',
		'sbvr-parser'              :  '../../common/sbvr-parser',
		'sbvr-compiler'            :  '../../server/src/sbvr-compiler',
		'Prettify'                 :  '../../common/Prettify',
		'underscore'               :  '../lib/underscore',
		'validator'                :  '../lib/validator-min',
		'js-beautify'              :  '../../external/beautify/beautify'
	},
	packages: [
		{
			name: 'css',
			location: '../tools/requirejs-plugins/css',
			main: 'css'
		}
	],
	shim: {
		'dust-core': {
			exports: 'dust'
		},
		'dust-full': {
			exports: 'dust'
		},
		'bootstrap': {
			deps: ['jquery', 'css!lib/bootstrap/bootstrap']
		},
		'css!static/main': {
			deps: ['bootstrap'],
		},
		'codemirror-simple-hint': {
			deps: ['codemirror', 'css!lib/codemirror/util/simple-hint']
		},
		'codemirror': {
			deps: [ 'css!lib/codemirror/codemirror'],
			exports: 'CodeMirror'
		},
		'jquery-xdomain': {
			deps: ['jquery']
		},
		'd3': {
			exports: 'd3'
		},
		'backbone': {
			deps: ['underscore', 'jquery-xdomain'],
			exports: 'Backbone',
			init: function () {
				return this.Backbone.noConflict();
			}
		},
		'underscore': {
			exports: '_',
			init: function () {
				return this._.noConflict();
			}
		}
	}
}, ['cs!app', 'css!static/main']);
