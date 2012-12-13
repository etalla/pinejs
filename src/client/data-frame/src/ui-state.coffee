define [
	'ometa!./ClientURIParser'
	'ometa!./ClientURIUnparser'
], (ClientURIParser, ClientURIUnparser) ->

	class UIState

		constructor: (uri) ->
			console.log("Input", uri)
			@root = null
			if uri?
				arr = ClientURIParser.matchAll(uri, "expr")
				@root = @_parseTree(arr[1])

			@toURI()

		_parseTree: (tree) ->
			mode = tree[0]
			entityName = tree[1][0]
			children = tree[3..]
			switch mode
				when 'instance'
					[mod, type, modifiers...] = tree[2]
				when 'collection'
					type = 'list'
					modifiers = tree[2]

			filters = modifiers.filter((e) -> e[0] is 'filt').map((e) ->
				return {
					operator: e[1][0]
					entityName: e[1][1]
					fieldName: e[1][2]
					value: e[1][3]
				}
			)
			return {
				mode
				entityName
				type
				filters
				children: @_parseTree(child) for child in children
			}

		_unparseTree: (tree) ->
			children = (@_unparseTree(child) for child in tree.children)
			modifiers = tree.filters.map((e) ->
				[
					'filt'
					[
						e.operator
						e.entityName
						e.fieldName
						e.value
					]
				]
			)
			modifiers.unshift(tree.type) if tree.type isnt 'list'
			modifiers.unshift('mod')

			return [
				tree.mode
				[tree.entityName]
				modifiers
			].concat(children)

		toURI: ->
			foo = ['uri', @_unparseTree(@root)]
			console.log("Output",ClientURIUnparser.match(foo, "trans"))
			

	return UIState

