# Hooks
Hooks are functions that you can implement in order to execute custom code when API calls are requested. The methods that are supported are `GET`, `POST`, `PUT`, `PATCH`. The sbvrUtils module of Pine.js is the mechanism that supports hooks addition. In particular, using `sbvrUtils.addHook`.

In order to to roll back the transaction you can either throw an error, or return a rejected promise. Also, any promises that are returned will be waited on before continuing with processing the request.

## Hook points
* `POSTPARSE({req, request, api[, tx]})` - runs right after the OData URI is parsed into a tree and before it gets converted to any SQL.  
	* The `request` object for POSTPARSE is lacking the `abstractSqlQuery` and `sqlQuery` entries. 
	* The `tx` object will only be available if running in the context of an internal request with a provided transaction.
* `PRERUN({req, request, api, tx})` - runs right before the main body/SQL elements run, which also happens to be after compiling to SQL has happened.
* `POSTRUN({req, request, result, api, tx})` - runs after the main body/SQL statements have run.
* `PRERESPOND({req, res, request, api, result, data[, tx]})` - runs right before we send the response to the API caller, which can be an internal or an external caller. It contains the data in OData response format. 
	* The `data` object for PRERESPOND is only present for GET requests. 
	* The `tx` object will only be available if running in the context of an internal request with a provided transaction.

## Arguments

### req
This is usually an express.js req object, however in the case of an internal API call it will only have the following properties (so you should only rely on these being available):

* user
* method
* url
* body

### request
This is an object describing the current request being made and contains the following properties:

* method: The method of the current request, eg GET/PUT/POST
* vocabulary: The API root that the request is for, eg Auth
* resourceName: The resource that the request relates to, eg user
* odataQuery: The OData OMeta structure.
* abstractSqlQuery: The Abstract SQL OMeta structure.
* sqlQuery: The SQL OMeta structure.
* values: The `body` of the request.
* custom: This is an empty object, you may store whatever you like here and have it available in later hooks.

### result
This is the result from running the transaction.

* GET - A database result object with the unprocessed rows that have been queried.
* POST - The inserted/updated id.
* PUT/PATCH/MERGE/DELETE - null

### data
* GET - This is the result after being processed into a JSON OData response (i.e. the `d` field).

### tx
The database transaction object, so that you can run queries in the same transaction or make API calls that use the same transaction.

### api
An instance of pinejs-client for the current api, using the permissions and transaction of the current request.
In the case of not being in a transaction, ie in cases where the `tx` argument is null, any requests via this object will be run in their own, separate, transaction.

See [tx](./CustomServerCode.md#markdown-header-tx_2)