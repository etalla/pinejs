define([
	'backbone'
	'jquery'
	'underscore'
	'cs!../../../../data-frame/src/ui-state'
	'cs!../../../../data-frame/src/backbone-model-generator'
	'dust!templates/draw-data/form'
], (Backbone, $, _, UIState, generate, form) ->

	models = generate("data")
	mitsos = new models.pilot({
		"id": -1
		"value": "Mitsos Michalakos"
		"is experienced": false
	})
	mitsos.on("error", (model, error) ->
		console.error(error)
	)
	mitsos.set("id", -5)
	
	#console.log new UIState("#/data/pilot/pilot*view*filt:id=1*filt:id=1")
	Backbone.View.extend(
		setTitle: (title) ->
			@options.title.text(title)

		render: ->
			@setTitle("Data editor")
			
			@model.on('change:content', =>
				clientModel = @model.toClientModel().resources
				form(clientModel.pilot, (err, out) =>
					@$el.html(out)
				)
			)
	)
)
