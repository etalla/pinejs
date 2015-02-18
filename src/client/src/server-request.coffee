define [
	'bluebird'
	'jquery'
], (Promise, $) ->
	requestId = 0
	return (method, uri, headers = {}, body, successCallback, failureCallback) ->
		deferred = Promise.pending()
		if !headers["Content-Type"]? and body?
			headers["Content-Type"] = "application/json"
		currentId = requestId++
		$("#httpTable").append('<tr class="server_row"><td><strong>' + method + '</strong></td><td>' + uri + '</td><td>' + (if headers.length == 0 then '' else JSON.stringify(headers)) + '</td><td>' + JSON.stringify(body) + '</td><td id="result' + currentId + '"></td></tr>')
		displayResult = (result) ->
			text = JSON.stringify(result, null, 4)
			resultCell = $('#result' + currentId)
			if text.split('\n').length > 30
				resultCell.html("""
					<a data-toggle="collapse" data-target="#pre#{currentId}"">
						Toggle Result
					</a>
					<div id="pre#{currentId}" class="collapse">
						<pre></pre>
					</div>
				""")
			else
				resultCell.html('<pre></pre>')
			$('pre', resultCell).text(text)
		deferred.promise.then(displayResult, displayResult)
		if ENV_BROWSER
			require ['server-glue'], (Server) ->
				deferred.fulfill(Server.app.process(method, uri, headers, body))
		else
			if body?
				body = JSON.stringify(body)
			$.ajax uri,
				headers: headers
				data: body
				error: (jqXHR, textStatus, errorThrown) ->
					try
						error = JSON.parse(jqXHR.responseText)
					catch e
						error = jqXHR.responseText
					deferred.reject([jqXHR.status, error])

				success: (data, textStatus, jqXHR) ->
					rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg
					responseHeaders = {}
					responseHeadersString = jqXHR.getAllResponseHeaders()
					while match = rheaders.exec( responseHeadersString )
						responseHeaders[ match[1].toLowerCase() ] = match[2]
					deferred.fulfill([jqXHR.status, data, responseHeaders])

				type: method
		if successCallback?
			deferred.promise.then((args) -> successCallback(args...))
		if failureCallback?
			deferred.promise.catch((args) -> failureCallback(args...))
		return deferred.promise
