define [
	'backbone'
	'cjs!validator'
], (Backbone, validator) ->

	generate = (namespace) ->
		# get the client model
		models = {}
		for own k, v of clientModel.resources
			# set model default attribute values
			defaults = {}
			for x in v.fields
				defaults[x[1]] = x[4]
			# extend model
		return models
	
	return generate
