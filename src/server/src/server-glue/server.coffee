define [
	'require'
	'has'
	'bluebird'
	'cs!database-layer/db'
	'cs!sbvr-api/sbvr-utils'
	'cs!passport-platform/passport-platform'
	'cs!platform-session-store/platform-session-store'
	'cs!data-server/SBVRServer'
	'cs!express-emulator/express'
	'cs!config-loader/config-loader'
], (requirejs, has, Promise, dbModule, sbvrUtils, passportPlatform, PlatformSessionStore, sbvrServer, express, configLoader) ->
	if has 'ENV_NODEJS'
		databaseURL = process.env.DATABASE_URL || 'postgres://postgres:.@localhost:5432/postgres'
		databaseOptions =
			engine: databaseURL[0...databaseURL.indexOf(':')]
			params: databaseURL
	else
		databaseOptions =
			engine: 'websql'
			params: 'rulemotion'

	db = dbModule.connect(databaseOptions)


	if has 'ENV_NODEJS'
		express = require('express')
		passport = require('passport')
		app = express()
		app.configure 'production', ->
			console.log = ->
		app.configure 'development', ->
			Promise.longStackTraces()
		app.configure ->
			path = require('path')
			app.use(express.compress())

			if has 'DEV'
				rootPath = path.join(__dirname, '/../../../..')
				app.use('/client', express.static(path.join(rootPath, 'client')))
				app.use('/common', express.static(path.join(rootPath, 'common')))
				app.use('/tools', express.static(path.join(rootPath, 'tools')))
			app.use('/', express.static(path.join(__dirname, 'static')))

			app.use(express.cookieParser())
			app.use(express.bodyParser())
			app.use(express.methodOverride())
			app.use(express.session(
				secret: 'A pink cat jumped over a rainbow'
				store: new PlatformSessionStore()
			))
			app.use(passport.initialize())
			app.use(passport.session())

			app.use (req, res, next) ->
				origin = req.get('Origin') || '*'
				res.header('Access-Control-Allow-Origin', origin)
				res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS, HEAD')
				res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Application-Record-Count, MaxDataServiceVersion, X-Requested-With')
				res.header('Access-Control-Allow-Credentials', 'true')
				next()

			app.use(app.router)
	else if has 'ENV_BROWSER'
		Promise.longStackTraces()
		app = express.app

	sbvrUtils.setup(app, requirejs, db)
	.then ->
		configLoader = configLoader.setup(app, requirejs)

		promises = []

		promises.push(
			configLoader.loadConfig(passportPlatform.config)
			.then ->
				if !process?.env.DISABLE_DEFAULT_AUTH
					app.post '/login', passportPlatform.login (err, user, req, res, next) ->
						if err
							console.error('Error logging in', err, err.stack)
							res.send(500)
						else if user is false
							if req.xhr is true
								res.send(401)
							else
								res.redirect('/login.html')
						else
							if req.xhr is true
								res.send(200)
							else
								res.redirect('/')
					app.get '/logout', passportPlatform.logout, (req, res, next) ->
						res.redirect('/')
		)

		if has 'SBVR_SERVER_ENABLED'
			promises.push(configLoader.loadConfig(sbvrServer.config))

		if has 'ENV_NODEJS'
			promises.push(configLoader.loadConfig(PlatformSessionStore.config))
			if has 'CONFIG_LOADER'
				promises.push(configLoader.loadNodeConfig())

		Promise.all(promises)
	.then ->
		if has 'ENV_NODEJS'
			app.listen process.env.PORT or 1337, ->
				console.info('Server started')

		if has 'ENV_BROWSER'
			app.enable()
	.catch (err) ->
		console.error('Error initialising server', err)
		process.exit()

	return {app, sbvrUtils}
