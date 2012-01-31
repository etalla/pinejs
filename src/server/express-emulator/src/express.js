(function() {
  var __slice = Array.prototype.slice;

  define(function(requirejs, exports, module) {
    var app;
    app = (function() {
      var addHandler, handlers;
      handlers = {
        POST: [],
        PUT: [],
        DELETE: [],
        GET: []
      };
      addHandler = function() {
        var handlerName, match, middleware, paramMatch, paramName, _ref;
        handlerName = arguments[0], match = arguments[1], middleware = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
        match = match.replace(/[\/\*]*$/, '');
        paramMatch = /:(.*)$/.exec(match);
        paramName = (_ref = paramMatch === null) != null ? _ref : {
          "null": paramMatch[1]
        };
        return handlers[handlerName].push({
          match: match,
          paramName: paramName,
          middleware: middleware
        });
      };
      return {
        post: function() {
          var args;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return addHandler.apply(null, ['POST'].concat(args));
        },
        get: function() {
          var args;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return addHandler.apply(null, ['GET'].concat(args));
        },
        put: function() {
          var args;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return addHandler.apply(null, ['PUT'].concat(args));
        },
        del: function() {
          var args;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return addHandler.apply(null, ['DELETE'].concat(args));
        },
        all: function() {
          this.post.apply(this, arguments);
          this.get.apply(this, arguments);
          this.put.apply(this, arguments);
          return this.del.apply(this, arguments);
        },
        process: function(method, uri, headers, body, successCallback, failureCallback) {
          var checkMethodHandlers, i, j, methodHandlers, next, req, res;
          if (uri.slice(-1) === '/') uri = uri.slice(0, (uri.length - 1));
          uri = uri.toLowerCase();
          console.log(uri);
          if (!handlers[method]) failureCallback(404);
          req = {
            body: body,
            headers: headers,
            url: uri,
            params: {}
          };
          res = {
            json: function(obj, headers, statusCode) {
              var _ref;
              if (headers == null) headers = 200;
              if (typeof headers === 'number' && !(statusCode != null)) {
                _ref = [headers, {}], statusCode = _ref[0], headers = _ref[1];
              }
              if (statusCode === 404) {
                return failureCallback(statusCode, obj);
              } else {
                return successCallback(statusCode, obj);
              }
            },
            send: function(statusCode) {
              if (statusCode === 404) {
                return failureCallback(statusCode);
              } else {
                return successCallback(statusCode);
              }
            }
          };
          next = function(route) {
            j++;
            if (route === 'route' || j >= methodHandlers[i].middleware.length) {
              return checkMethodHandlers();
            } else {
              return methodHandlers[i].middleware[j](req, res, next);
            }
          };
          methodHandlers = handlers[method];
          i = -1;
          j = -1;
          checkMethodHandlers = function() {
            i++;
            if (i < methodHandlers.length) {
              if (uri.slice(0, methodHandlers[i].match.length) === methodHandlers[i].match) {
                j = -1;
                if (methodHandlers[i].paramName !== null) {
                  req.params[methodHandlers[i].paramName] = uri.slice(methodHandlers[i].match.length);
                }
                return next();
              } else {
                return checkMethodHandlers();
              }
            } else {
              return res.send(404);
            }
          };
          return checkMethodHandlers();
        }
      };
    })();
    return {
      app: app
    };
  });

}).call(this);