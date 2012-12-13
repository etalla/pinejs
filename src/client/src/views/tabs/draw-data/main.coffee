define([
	'backbone'
	'jquery'
	'underscore'
	'cs!../../../../data-frame/src/ui-state'
	'dust!templates/draw-data/form'
], (Backbone, $, _, UIState, form) ->
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
