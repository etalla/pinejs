define([
	'backbone'
	'jquery'
	'underscore'
	'cs!../../../../data-frame/src/ui-state'
], (Backbone, $, _, UIState) ->
	console.log UIState
	Backbone.View.extend(
		setTitle: (title) ->
			@options.title.text(title)

		render: ->
			@setTitle("Data editor")
			
	)
)
