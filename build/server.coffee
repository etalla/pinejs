webpack = require 'webpack'
_ = require 'lodash'
config = _.clone require './config'

config.entry += '/src/server-glue/server'
config.plugins = config.plugins.concat(
	new webpack.DefinePlugin(
		'process.browser': false

		'process.env.CONFIG_LOADER_DISABLED': false
		'process.env.SBVR_SERVER_ENABLED': false
	)
)

module.exports = config
