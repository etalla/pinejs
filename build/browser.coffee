webpack = require 'webpack'
_ = require 'lodash'
config = _.clone require './config'

root = config.entry
config.entry = root + '/src/server-glue/server'

# Disable node express and load express-emulator instead
config.externals.express = false
config.resolve.alias.express = root + '/src/express-emulator/express'

config.plugins = config.plugins.concat(
	new webpack.DefinePlugin(
		'process.browser': true
		'process.env.CONFIG_LOADER_DISABLED': true
		'process.env.DEBUG': true
		'process.env.SBVR_SERVER_ENABLED': true
	)
)

module.exports = config
