define([
	'backbone'
	'jquery'
	'underscore'
	'cs!../../../../data-frame/src/ui-state'
	'cs!../../../../data-frame/src/backbone-model-generator'
], (Backbone, $, _, UIState, generate) ->

	console.log generate({
	   "resources":{
	      "pilot":{
	         "resourceName":"pilot",
	         "modelName":"pilot",
	         "topLevel":true,
	         "fields":[
	            [
	               "Serial",
	               "id",
	               true,
	               "PRIMARY KEY",
	               null
	            ],
	            [
	               "Value",
	               "value",
	               true,
	               null,
	               null
	            ],
	            [
	               "Boolean",
	               "is experienced",
	               true,
	               null,
	               null
	            ]
	         ],
	         "idField":"id",
	         "valueField":"value",
	         "actions":[
	            "view",
	            "add",
	            "edit",
	            "delete"
	         ]
	      },
	      "plane":{
	         "resourceName":"plane",
	         "modelName":"plane",
	         "topLevel":true,
	         "fields":[
	            [
	               "Serial",
	               "id",
	               true,
	               "PRIMARY KEY",
	               null
	            ],
	            [
	               "Value",
	               "value",
	               true,
	               null,
	               null
	            ]
	         ],
	         "idField":"id",
	         "valueField":"value",
	         "actions":[
	            "view",
	            "add",
	            "edit",
	            "delete"
	         ]
	      },
	      "pilot-can_fly-plane":{
	         "resourceName":"pilot-can_fly-plane",
	         "modelName":"pilot can fly plane",
	         "topLevel":false,
	         "fields":[
	            [
	               "ForeignKey",
	               "pilot",
	               true,
	               "",
	               "id"
	            ],
	            [
	               "ForeignKey",
	               "plane",
	               true,
	               "",
	               "id"
	            ],
	            [
	               "Serial",
	               "id",
	               true,
	               "PRIMARY KEY",
	               null
	            ]
	         ],
	         "idField":"id",
	         "actions":[
	            "view",
	            "add",
	            "edit",
	            "delete"
	         ]
	      },
	      "pilot-is_experienced":{
	         "resourceName":"pilot-is_experienced",
	         "modelName":"pilot is experienced",
	         "topLevel":false,
	         "fields":[
	            [
	               "ForeignKey",
	               "pilot",
	               "NOT NULL",
	               "id"
	            ],
	            [
	               "Boolean",
	               "is experienced",
	               true,
	               null,
	               null
	            ]
	         ],
	         "idField":"pilot",
	         "valueField":"is experienced",
	         "actions":[
	            "view",
	            "add",
	            "delete"
	         ]
	      }
	   },
	   "resourceToSQLMappings":{
	      "pilot":{
	         "id":[
	            "pilot",
	            "id"
	         ],
	         "value":[
	            "pilot",
	            "value"
	         ],
	         "is experienced":[
	            "pilot",
	            "is experienced"
	         ]
	      },
	      "plane":{
	         "id":[
	            "plane",
	            "id"
	         ],
	         "value":[
	            "plane",
	            "value"
	         ]
	      },
	      "pilot-can_fly-plane":{
	         "pilot":[
	            "pilot-can_fly-plane",
	            "pilot"
	         ],
	         "plane":[
	            "pilot-can_fly-plane",
	            "plane"
	         ],
	         "id":[
	            "pilot-can_fly-plane",
	            "id"
	         ]
	      },
	      "pilot-is_experienced":{
	         "pilot":[
	            "pilot",
	            "id"
	         ],
	         "is experienced":[
	            "pilot",
	            "is experienced"
	         ]
	      }
	   }
	})
	
	console.log UIState.fromURI("O Aggelatos einai aderfi")
	Backbone.View.extend(
		setTitle: (title) ->
			@options.title.text(title)

		render: ->
			@setTitle("Data editor")
			
	)
)
