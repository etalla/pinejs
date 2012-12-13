define [
	'ometa!./ClientURIParser'
	'ometa!./ClientURIUnparser'
], (ClientURIParser, ClientURIUnparser) ->

	console.log arguments

	class UIState

		constructor: ->
			null
			
		_parseTree: (tree) ->
			type = tree[0]
			entityName = tree[1][0]
			
			console.log type, entityName
			
			

		@fromURI: (uri) ->
			uri = "#/data/student.134*view"
			arr = ClientURIParser.matchAll(uri, "expr")
			console.log uri
			console.log (JSON.stringify(arr, null, 4))
		
	return UIState