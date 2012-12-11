define([
	'backbone'
	'jquery'
	'underscore'
], (Backbone, $, _) ->
	Backbone.View.extend(
		setTitle: (title) ->
			@options.title.text(title)

		render: ->
			@setTitle("Data editor")
			
	)
)
