define [
	'backbone'
], (Backbone) ->

	generate = (clientModel) ->
		models = {}
		for own k, v of clientModel.resources
			# set model defaults
			defaults = {}
			for x in v.fields
				defaults[x[1]] = x[4]
			# extend model
			models[k] = Backbone.Model.extend({
				defaults
			})
		return models
	
	return generate