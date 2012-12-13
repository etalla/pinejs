(function() { var define = require('requirejs').define;
define('cs',{load: function(id){throw new Error("Dynamic load not allowed: " + id);}});
define('has',['module'], function (module) {
	var config = module.config();
	return function (flag) {
		return config.hasOwnProperty(flag) && config[flag];
	};
});

OMeta = (function() {
  
  /*
    new syntax:
      #foo and `foo  match the string object 'foo' (it's also accepted in my JS)
      'abc'    match the string object 'abc'
      'c'      match the string object 'c'
      ``abc''    match the sequence of string objects 'a', 'b', 'c'
      "abc"    token('abc')
      [1 2 3]    match the array object [1, 2, 3]
      foo(bar)    apply rule foo with argument bar
      -> ...    semantic actions written in JS (see OMetaParser's atomicHostExpr rule)
  */

  /*
  ometa M {
    number = number:n digit:d -> { n * 10 + parseInt(d, 10) }
           | digit:d          -> { parseInt(d, 10) }
  }

  translates to...

  M = objectThatDelegatesTo(OMeta, {
    number: function() {
              return this._or(function() {
                                var n = this._apply("number"),
                                    d = this._apply("digit")
                                return n * 10 + parseInt(d, 10)
                              },
                              function() {
                                var d = this._apply("digit")
                                return parseInt(d, 10)
                              }
                             )
            }
  })
  M.matchAll("123456789", "number")
  */

  //
  // failure exception
  //
  var fail = function fail() {
    return fail.error;
  };
  fail.error = new SyntaxError('match failed');
  fail.error._extend = function(child) {
    return objectThatDelegatesTo(this, child);
  };

  //
  // ### function objectThatDelegatesTo(obj, props)
  // #### @obj {Object} parent object
  // #### @props {Object} object to merge result with
  // Returns object with merged properties of `obj` and `props`
  //
  function objectThatDelegatesTo(obj, props) {
    var clone = Object.create(obj || {});

    for (var key in props) {
      if (props.hasOwnProperty(key)) {
        clone[key] = props[key];
      }
    }

    return clone;
  }

  //
  // ### function isSequenceable(o)
  // #### @o {any} object to perform check against
  // Returns true if object is sequenceable
  //
  function isSequenceable(o) {
    return typeof o === 'string' || Array.isArray(o);
  }

  //
  // ### function getTag(o)
  // #### @o {Object} input
  // unique tags for objects (useful for making "hash tables")
  //
  function getTag(o) {
    if (o == null) {
      return 'null';
    }

    switch (typeof o) {
      case "boolean":
        return o === true ? "Btrue" : "Bfalse";
      case "string":
        return "S" + o;
      case "number":
        return "N" + o;
      default:
        if (!o.hasOwnProperty("_id_")) {
          o._id_ = "R" + getTag.id++;
        }
        return o._id_;
    }
  }
  getTag.id = 0;

  //
  // ### function isImmutable(o)
  // #### @o {any} object to perform check against
  // Returns true if object is immutable
  //
  function isImmutable(o) {
     return o == null ||
            typeof o === 'boolean' || typeof o === 'number' ||
            typeof o === 'string';
  }

  //
  // ### function lookup (fn, success, fallback)
  // #### @fn {Function} function that may throw
  // #### @success {Function} call if function hasn't thrown
  // #### @fallback {Function} call if function thrown fail()
  //
  function lookup(fn, success, fallback) {
    var value;
    try {
      value = fn();
    } catch (e) {
      if (!(e instanceof SyntaxError)) {
        throw e;
      }
      return fallback && fallback(e);
    }

    return success && success(value);
  }

  //
  // ### function OMInputStream(hd, tl)
  // #### @hd {any} Head
  // #### @tl {Object} Tail
  // Streams and memoization
  //
  function OMInputStream(hd, tl) {
    this.memo = {};
    this.lst  = tl.lst;
    this.idx  = tl.idx;
    this.hd   = hd;
    this.tl   = tl;
  }

  //
  // ### function head ()
  // Returns stream's `hd` property
  //
  OMInputStream.prototype.head = function() { return this.hd; };

  //
  // ### function tail ()
  // Returns stream's `tl` property
  //
  OMInputStream.prototype.tail = function() { return this.tl; };

  //
  // ### function type ()
  // Returns stream's `lst` property constructor
  //
  OMInputStream.prototype.type = function() { return this.lst.constructor; };

  //
  // ### function upTo (that)
  // #### @that {Object} target object
  // Visit all tails and join all met heads and return string or array
  // (depending on `.lst` type)
  //
  OMInputStream.prototype.upTo = function(that) {
    var r = [], curr = this;
    while (curr !== that) {
      r.push(curr.head());
      curr = curr.tail();
    }
    return this.type() === String ? r.join('') : r;
  };

  //
  // ### function OMInputStreamEnd (lst, idx)
  // #### @lst {Array} list
  // #### @idx {Number} index
  // Internal class
  //
  function OMInputStreamEnd(lst, idx) {
    this.memo = {};
    this.lst = lst;
    this.idx = idx;
  }
  OMInputStreamEnd.prototype = objectThatDelegatesTo(OMInputStream.prototype);

  //
  // ### function head ()
  // Not implemented
  //
  OMInputStreamEnd.prototype.head = function() { throw fail(); };

  //
  // ### function tail ()
  // Not implemented
  //
  OMInputStreamEnd.prototype.tail = function() { throw fail(); };

  //
  // ### function ListOMInputStream (lst, idx)
  // #### @lst {Array} list
  // #### @idx {Number} index
  // Returns self-expanding stream
  //
  function ListOMInputStream(lst, idx) {
    this.memo = { };
    this.lst  = lst;
    this.idx  = idx;
    this.hd   = lst[idx];
  }
  ListOMInputStream.prototype = objectThatDelegatesTo(OMInputStream.prototype);

  //
  // ### function head ()
  // Returns stream's `hd` property's value
  //
  ListOMInputStream.prototype.head = function() { return this.hd; };

  //
  // ### function tail ()
  // Returns or creates stream's tail
  //
  ListOMInputStream.prototype.tail = function() {
    return this.tl || (this.tl = makeListOMInputStream(this.lst, this.idx + 1));
  };

  //
  // ### function makeListOMInputStream (lst, idx)
  // #### @lst {Array} List
  // #### @idx {Number} index
  // Returns either ListOMInputStream's or OMInputStreamEnd's instance
  //
  function makeListOMInputStream(lst, idx) {
    if (idx < lst.length) {
      return new ListOMInputStream(lst, idx);
    } else {
      return new OMInputStreamEnd(lst, idx);
    }
  }

  //
  // ### function makeOMInputStreamProxy (target)
  // #### @target {any} Delegate's constructor
  // Returns object with stream's properties
  // (has self-expanding tail)
  //
  function makeOMInputStreamProxy(target) {
    return {
      memo: {},
      target: target,
      idx: target.idx,
      tl: undefined,
      type: function() {
        return String;
      },
      upTo: OMInputStream.prototype.upTo,
      head: function() {
        return target.head();
      },
      tail: function() {
        return this.tl || (this.tl = makeOMInputStreamProxy(target.tail()));
      }
    };
  }

  //
  // ### OMeta
  // the OMeta "class" and basic functionality
  //
  return {
    _extend: function(child) {
      return objectThatDelegatesTo(this, child);
    },
    _fail: fail,
    _enableTokens: function(rulesToTrack) {
      if(rulesToTrack == null) {
        // No rules to track were supplied and it wasn't even a reference they could be added to.
        return;
      }
      this._enableTokens = function() {
        throw 'Can only enable tokens once';
      };
      this._tokensEnabled = function() {
        return true;
      };
      this._addToken = function(startInput, endInput, rule, ruleArgs) {
        if(rulesToTrack.indexOf(rule) !== -1 && startInput !== endInput) {
          while(startInput.hasOwnProperty('target')) {
            startInput = startInput.target;
          }
          while(endInput.hasOwnProperty('target')) {
            endInput = endInput.target;
          }
          if(!startInput.hasOwnProperty('tokens')) {
            startInput.tokens = [];
          }
          startInput.tokens.push([endInput.idx, rule, ruleArgs]);
        }
      };
    },
    _addToken: function() {},
    _tokensEnabled: function() {
      return false;
    },
    
    _enableBranchTracking: function(rulesToTrack) {
      var branches = [];
      this._enableBranchTracking = function() {
        throw 'Can only enable tokens once';
      };
      this._addBranch = function(rule, ruleArgs) {
        if(rulesToTrack.hasOwnProperty(rule)) {
          var idx = this.input.idx;
          if(branches[idx] === undefined) {
            branches[idx] = {};
          }
          branches[idx][rule] = ruleArgs;
        }
      };
      this._getBranches = function() {
        return branches;
      };
    },
    _addBranch: function() {},
    _getBranches: function() {},
    
    _apply: function(rule) {
      var memo = this.input.memo,
          memoRec = memo[rule],
          origInput = this.input;
      this._addBranch(rule, []);
      if (memoRec === undefined) {

        memo[rule] = false;
        memoRec = {
          ans: this[rule].call(this),
          nextInput: this.input
        };
        var failer = memo[rule];
        memo[rule] = memoRec;

        // If we tried to match this rule again without progressing the input at all
        // then retry matching it now that we have an answer for it, this allows for rules like `A = A 'x' | 'x'`
        if (failer === true) {
          var self = this,
              sentinel = this.input,
              returnTrue = function () {
                return true;
              },
              returnFalse = function () {
                return false;
              },
              lookupFunc = function() {
                self.input = origInput;
                var ans = self[rule]();

                if (self.input === sentinel) {
                  throw fail();
                }

                memoRec.ans       = ans;
                memoRec.nextInput = self.input;
              };
          while (true) {
            var result = lookup(lookupFunc, returnFalse, returnTrue);
            if (result) {
              break;
            }
          }
        }
      }
      else if (typeof memoRec === 'boolean') {
        memo[rule] = true;
        throw fail();
      }
      this.input = memoRec.nextInput;
      this._addToken(origInput, this.input, rule, []);
      return memoRec.ans;
    },

    // note: _applyWithArgs and _superApplyWithArgs are not memoized, so they can't be left-recursive
    _applyWithArgs: function(rule) {
      var origInput = this.input,
          ruleFn = this[rule],
          ruleFnArity = ruleFn.length,
          ruleArgs = Array.prototype.slice.call(arguments, 1, ruleFnArity + 1);
      for (var idx = arguments.length - 1; idx > ruleFnArity; idx--) { // prepend "extra" arguments in reverse order
        this._prependInput(arguments[idx]);
      }
      this._addBranch(rule, ruleArgs);
      var ans = ruleFnArity === 0 ?
               ruleFn.call(this) :
               ruleFn.apply(this, ruleArgs);
      this._addToken(origInput, this.input, rule, ruleArgs);
      return ans;
    },
    _superApplyWithArgs: function(recv, rule) {
      var origInput = recv.input,
          ruleFn = this[rule],
          ruleFnArity = ruleFn.length,
          ruleArgs = Array.prototype.slice.call(arguments, 2, ruleFnArity + 2);
      for (var idx = arguments.length - 1; idx > ruleFnArity + 1; idx--) { // prepend "extra" arguments in reverse order
        recv._prependInput(arguments[idx]);
      }
      this._addBranch(rule, ruleArgs);
      var ans = ruleFnArity === 0 ?
               ruleFn.call(recv) :
               ruleFn.apply(recv, ruleArgs);
      this._addToken(origInput, recv.input, rule, ruleArgs);
      return ans;
    },
    _prependInput: function(v) {
      this.input = new OMInputStream(v, this.input);
    },
    
    // Use this if you want to disable prepending to the input (increases performances but requires using `Rule :param1 :param2 =` style parameter binding at all times)
    _disablePrependingInput: function() {
      this._applyWithArgs = function(rule) {
        var origInput = this.input,
            ruleArgs = Array.prototype.slice.call(arguments, 1);
        this._addBranch(rule, ruleArgs);
        var ans = this[rule].apply(this, ruleArgs);
        this._addToken(origInput, this.input, rule, ruleArgs);
        return ans;
      };
      this._superApplyWithArgs = function(recv, rule) {
        var origInput = recv.input,
            ruleArgs = Array.prototype.slice.call(arguments, 2);
        this._addBranch(rule, ruleArgs);
        var ans = this[rule].apply(recv, ruleArgs);
        this._addToken(origInput, recv.input, rule, ruleArgs);
        return ans;
      };
    },

    // if you want your grammar (and its subgrammars) to memoize parameterized rules, invoke this method on it:
    memoizeParameterizedRules: function() {
      this._prependInput = function(v) {
        var newInput;
        if (isImmutable(v)) {
          newInput = this.input[getTag(v)];
          if (!newInput) {
            newInput = new OMInputStream(v, this.input);
            this.input[getTag(v)] = newInput;
          }
        }
        else {
          newInput = new OMInputStream(v, this.input);
        }
        this.input = newInput;
      };
      this._applyWithArgs = function(rule) {
        var origInput = this.input,
            ruleFn = this[rule],
            ruleFnArity = ruleFn.length,
            ruleArgs = Array.prototype.slice.call(arguments, 1, ruleFnArity + 1);
        for (var idx = arguments.length - 1; idx > ruleFnArity; idx--) { // prepend "extra" arguments in reverse order
          this._prependInput(arguments[idx]);
        }
        this._addBranch(rule, ruleArgs);
        var ans = ruleFnArity === 0 ?
                 ruleFn.call(this) :
                 ruleFn.apply(this, ruleArgs);
        this._addToken(origInput, this.input, rule, ruleArgs);
        return ans;
      };
    },

    _pred: function(b) {
      if (b) {
        return true;
      }

      throw fail();
    },
    _not: function(x) {
      var self = this,
          origInput = this.input,
          origAddBranch = this._addBranch,
          origAddToken = this._addToken;
      this._addBranch = this._addToken = function() {};
      try {
        return lookup(function() {
          x.call(self);
        }, function() {
          throw fail();
        }, function() {
          self.input = origInput;
          return true;
        });
      }
      finally {
        this._addBranch = origAddBranch;
        this._addToken = origAddToken;
      }
    },
    _lookahead: function(x) {
      var origInput = this.input,
          r         = x.call(this);
      this.input = origInput;
      return r;
    },
    _or: function() {
      var self = this,
          origInput = this.input,
          ref = {},
          result = ref,
          lookupFunc = function() {
            self.input = origInput;
            result = arg.call(self);
          };

      for (var idx = 0; idx < arguments.length; idx++) {
        var arg = arguments[idx];

        lookup(lookupFunc);

        if (result !== ref) {
          return result;
        }
      }

      throw fail();
    },
    _xor: function(ruleName) {
      var self = this,
          origInput = this.input,
          idx = 1,
          newInput,
          ans,
          arg,
          lookupFunc = function() {
            self.input = origInput;
            ans = arg.call(self);
            if (newInput) {
              throw 'more than one choice matched by "exclusive-OR" in ' + ruleName;
            }
            newInput = self.input;
          };

      while (idx < arguments.length) {
        arg = arguments[idx];

        lookup(lookupFunc);
        idx++;
      }

      if (newInput) {
        this.input = newInput;
        return ans;
      }
      else {
        throw fail();
      }
    },
    disableXORs: function() {
      this._xor = function() {
        var self = this,
            origInput = this.input,
            ref = {},
            result = ref,
            lookupFunc = function() {
              self.input = origInput;
              result = arg.call(self);
            };

        for (var idx = 1; idx < arguments.length; idx++) {
          var arg = arguments[idx];

          lookup(lookupFunc);

          if (result !== ref) {
            return result;
          }
        }
        throw fail();
      };
    },
    _opt: function(x) {
      var self = this,
          origInput = this.input,
          ans;

      lookup(function() {
        ans = x.call(self);
      }, function() {
      }, function() {
        self.input = origInput;
      });

      return ans;
    },
    _many: function(x) {
      var self = this,
          origInput,
          ans = arguments[1] !== undefined ? [arguments[1]] : [],
          returnTrue = function () {
            self.input = origInput;
            return true;
          },
          returnFalse = function () {
            return false;
          },
          lookupFunc = function() {
            ans.push(x.call(self));
          };

      while (true) {
        origInput = this.input;

        var result = lookup(lookupFunc, returnFalse, returnTrue);

        if (result) {
          break;
        }
      }
      return ans;
    },
    _many1: function(x) {
      return this._many(x, x.call(this));
    },
    _form: function(x) {
      var r,
          v = this._apply("anything"),
          origInput = this.input;
      if (!isSequenceable(v)) {
        throw fail();
      }
      this.input =  makeListOMInputStream(v, 0);
      r = x.call(this);
      this._apply("end");
      this.input = origInput;
      return v;
    },
    _consumedBy: function(x) {
      var origInput = this.input;
      x.call(this);
      return origInput.upTo(this.input);
    },
    _idxConsumedBy: function(x) {
      var origInput = this.input;
      x.call(this);
      return {fromIdx: origInput.idx, toIdx: this.input.idx};
    },
    _interleave: function(/* mode1, part1, mode2, part2 ..., moden, partn */) {
      var currInput = this.input, ans = [], idx, args = Array.prototype.slice.call(arguments);
      for (idx = 0; idx < args.length; idx += 2) {
        ans[idx / 2] = (args[idx] === "*" || args[idx] === "+") ? [] : undefined;
      }
      while (true) {
        var allDone = true;
        idx = 0;
        while (idx < args.length) {
          if (args[idx] !== "0") {
            try {
              this.input = currInput;
              switch (args[idx]) {
                case "*":
                  ans[idx / 2].push(args[idx + 1].call(this));
                  break;
                case "+":
                  ans[idx / 2].push(args[idx + 1].call(this));
                  args[idx] = "*";
                break;
                case "?":
                  ans[idx / 2] = args[idx + 1].call(this);
                  args[idx] = "0";
                break;
                case "1":
                  ans[idx / 2] = args[idx + 1].call(this);
                  args[idx] = "0";
                break;
                default:
                  throw "invalid mode '" + args[idx] + "' in OMeta._interleave";
              }
              currInput = this.input;
              break;
            }
            catch (f) {
              if (!(f instanceof SyntaxError)) {
                throw f;
              }
              // if this (failed) part's mode is "1" or "+", we're not done yet
              allDone = allDone && (args[idx] === "*" || args[idx] === "?");
            }
          }
          idx += 2;
        }
        if (idx === args.length) {
          if (allDone) {
            return ans;
          }
          else {
            throw fail();
          }
        }
      }
    },
    _currIdx: function() {
      return this.input.idx;
    },

    // some basic rules
    anything: function() {
      var r = this.input.head();
      this.input = this.input.tail();
      return r;
    },
    end: function() {
      return this._not(function() {
        return this._apply("anything");
      });
    },
    pos: function() {
      return this.input.idx;
    },
    empty: function() {
      return true;
    },
    apply: function(r) {
      return this._apply(r);
    },
    foreign: function(grammar, ruleName) {
      var ans,
          grammarInstance = grammar._extend({input: makeOMInputStreamProxy(this.input)});
      if(this._tokensEnabled()) {
        grammarInstance._enableTokens();
      }
      ans = grammarInstance._apply(ruleName);
      // No need to merge tokens as they will automatically have been placed on the root target.
      this.input = grammarInstance.input.target;
      return ans;
    },

    //  some useful "derived" rules
    exactly: function(wanted) {
      if (wanted === this._apply("anything")) {
        return wanted;
      }
      throw fail();
    },
    "true": function() {
      var r = this._apply("anything");
      this._pred(r === true);
      return r;
    },
    "false": function() {
      var r = this._apply("anything");
      this._pred(r === false);
      return r;
    },
    "undefined": function() {
      var r = this._apply("anything");
      this._pred(r === undefined);
      return r;
    },
    number: function() {
      var r = this._apply("anything");
      this._pred(typeof r === "number");
      return r;
    },
    string: function() {
      var r = this._apply("anything");
      this._pred(typeof r === "string");
      return r;
    },
    "char": function() {
      var r = this._apply("anything");
      this._pred(typeof r === "string" && r.length === 1);
      return r;
    },
    space: function() {
      var r = this._apply("char");
      this._pred(r.charCodeAt(0) <= 32);
      return r;
    },
    spaces: function() {
      return this._many(function() {
        return this._apply("space");
      });
    },
    digit: function() {
      var r = this._apply("char");
      this._pred(r >= "0" && r <= "9");
      return r;
    },
    lower: function() {
      var r = this._apply("char");
      this._pred(r >= "a" && r <= "z");
      return r;
    },
    upper: function() {
      var r = this._apply("char");
      this._pred(r >= "A" && r <= "Z");
      return r;
    },
    letter: function() {
      var r = this._apply("char");
      this._pred(r >= "a" && r <= "z" || r >= "A" && r <= "Z");
      return r;
      // Note: The following code will potentially make use of more memoisations,
      // however it will have more overhead and it is unlikely that letter/upper/lower calls will be mixed in a memoisable way.
      // return this._or(function() { return this._apply("lower"); },
                      // function() { return this._apply("upper"); });
    },
    letterOrDigit: function() {
      return this._or(function() { return this._apply("letter"); },
                      function() { return this._apply("digit"); });
    },
    firstAndRest: function(first, rest)  {
      return this._many(function() {
        return this._apply(rest);
      }, this._apply(first));
    },
    seq: function(xs) {
      for (var idx = 0; idx < xs.length; idx++) {
        this._applyWithArgs("exactly", xs[idx]);
      }
      return xs;
    },
    notLast: function(rule) {
      var r = this._apply(rule);
      this._lookahead(function() { return this._apply(rule); });
      return r;
    },
    listOf: function(rule, delim) {
      return this._or(function() {
                        var r = this._apply(rule);
                        return this._many(function() {
                                            this._applyWithArgs("token", delim);
                                            return this._apply(rule);
                                          },
                                          r);
                      },
                      function() { return []; });
    },
    token: function(cs) {
      this._apply("spaces");
      return this._applyWithArgs("seq", cs);
    },
    fromTo: function (x, y) {
      return this._consumedBy(function() {
                                this._applyWithArgs("seq", x);
                                this._many(function() {
                                  this._not(function() { this._applyWithArgs("seq", y); });
                                  this._apply("char");
                                });
                                this._applyWithArgs("seq", y);
                              });
    },
    hexDigit: function() {
      var v, c;
      c = this._apply("char");
      v = "0123456789abcdef".indexOf(c.toLowerCase());
      if(v === -1) {
        throw this._fail();
      }
      return v;
    },
    escapedChar: function() {
      var s, c;
      this._applyWithArgs("exactly", "\\");
      c = this._apply("anything");
      switch (c) {
        case "'":  return "'";
        case '"':  return '"';
        case '\\': return '\\';
        case 'b':  return '\b';
        case 'f':  return '\f';
        case 'n':  return '\n';
        case 'r':  return '\r';
        case 't':  return '\t';
        case 'v':  return '\v';
        case "u":
          s = this._consumedBy(function() {
            this._apply("hexDigit");
            this._apply("hexDigit");
            this._apply("hexDigit");
            this._apply("hexDigit");
          });
          return String.fromCharCode(parseInt(s, 16));
        case "x":
          s = this._consumedBy(function() {
            this._apply("hexDigit");
            this._apply("hexDigit");
          });
          return String.fromCharCode(parseInt(s, 16));
        default:
          return c;
      }
    },

    initialize: function() {},
    // match and matchAll are a grammar's "public interface"
    _genericMatch: function(input, rule, args, matchFailed) {
      if (args == null) {
        args = [];
      }
      var realArgs = [rule];
      for (var idx = 0; idx < args.length; idx++) {
        realArgs.push(args[idx]);
      }
      var m = objectThatDelegatesTo(this, {input: input});
      m.initialize();

      return lookup(function() {
        return realArgs.length === 1 ?
            m._apply.call(m, realArgs[0]) :
            m._applyWithArgs.apply(m, realArgs);
      }, function(value) {
        return value;
      }, function(err) {
        if (typeof matchFailed === 'function') {
          var input = m.input;
          if (input.idx !== undefined) {
            while (input.tl !== undefined && input.tl.idx !== undefined) {
              input = input.tl;
            }
            input.idx--;
          }
          return matchFailed(m, input.idx, fail(), err);
        }
        throw err;
      });
    },
    match: function(obj, rule, args, matchFailed) {
      return this._genericMatch(makeListOMInputStream([obj], 0), rule, args, matchFailed);
    },
    matchAll: function(listyObj, rule, args, matchFailed) {
      return this._genericMatch(makeListOMInputStream(listyObj, 0), rule, args, matchFailed);
    },
    createInstance: function() {
      var m = objectThatDelegatesTo(this);
      m.initialize();
      m.setInput = function(listyObj) {
        return this.inputHead = this.input = makeListOMInputStream(listyObj, 0);
      };
      m.matchAll = function(listyObj, aRule) {
        this.setInput(listyObj);
        return this._apply(aRule);
      };
      m.match = function(obj, aRule) {
        return this.matchAll([obj], aRule);
      };
      // This will reuse memoisations when possible, currently only works for string inputs.
      m.enableReusingMemoizations = function(sideEffectingRules) {
        sideEffectingRules = sideEffectingRules || [];
        this.setInput = function(listyObj) {
          var input = this.inputHead;
          if(input && typeof input.lst === 'string' && typeof listyObj === 'string') {
            var previousText = input.lst;
            for(var divergencePoint = 0, l = Math.min(listyObj.length, previousText.length); divergencePoint < l; divergencePoint++) {
              if(listyObj.charAt(divergencePoint) !== previousText.charAt(divergencePoint)) {
                break;
              }
            }
            // We will have stepped one past the divergence point, so decrement to correct.
            divergencePoint--;
            if(divergencePoint > 0) {
              //  If we diverge after the first character then fixup the memoisations.
              do {
                var memo = input.memo,
                  memoTokens = input.tokens;
                // For each memoised rule, delete it if it is a boolean (failer - it may now parse)
                // or if it is a rule with side effects.
                // or if it ends on or after the point of divergence (the nextInput is guaranteed to be wrong,
                // even if the rule will still pass - for the ending on the divergence point then it might be a case that with the change the rule will now encompass more)
                // There should be no need to update the memoised new inputs - as we traverse through inputs by idx they should be updated (as they should be references).
                for(var ruleName in memo) {
                  if(typeof memo[ruleName] === 'boolean'
                    || sideEffectingRules.indexOf(ruleName) !== -1
                    || memo[ruleName].nextInput.idx >= divergencePoint) {
                    delete memo[ruleName];
                  }
                }
                // Remove tokens that end on or after the divergence point, similar to memoisation
                if(memoTokens != null) {
                  var duplicateTokens = {};
                  for(var i = memoTokens.length - 1; i >= 0; i--) {
                    if(memoTokens[i][0] >= divergencePoint || duplicateTokens[memoTokens[i][1]]) {
                      memoTokens.splice(i, 1);
                    }
                    else {
                      duplicateTokens[memoTokens[i][1]] = true;
                    }
                  }
                }
                input.lst = listyObj;
              } while(input.idx < divergencePoint && (input = input.tail()));
              delete input.tl;
              return this.input = this.inputHead;
            }
          }
          // If we couldn't reuse memoisations for whatever reason then just create a new input.
          return this.input = this.inputHead = makeListOMInputStream(listyObj, 0);
        };
      };
      return m;
    }
  };
})();

if(typeof exports !== "undefined") {
  exports.OMeta = OMeta;
};
define("ometa-core", function(){});

if (typeof exports === "undefined") {
    exports = {};
}

{
    var BSJSParser = exports.BSJSParser = OMeta._extend({
        comment: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case "/":
                        return function() {
                            this._applyWithArgs("exactly", "/");
                            "//";
                            this._many(function() {
                                this._not(function() {
                                    return this._or(function() {
                                        return this._apply("end");
                                    }, function() {
                                        return function() {
                                            switch (this._apply("anything")) {
                                              case "\n":
                                                return "\n";
                                              default:
                                                throw this._fail();
                                            }
                                        }.call(this);
                                    });
                                });
                                return this._apply("char");
                            });
                            return this._or(function() {
                                return this._apply("end");
                            }, function() {
                                return function() {
                                    switch (this._apply("anything")) {
                                      case "\n":
                                        return "\n";
                                      default:
                                        throw this._fail();
                                    }
                                }.call(this);
                            });
                        }.call(this);
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                return this._applyWithArgs("fromTo", "/*", "*/");
            });
        },
        space: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return OMeta._superApplyWithArgs(this, "space");
            }, function() {
                return this._apply("comment");
            });
        },
        nameFirst: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("letter");
            }, function() {
                return function() {
                    switch (this._apply("anything")) {
                      case "$":
                        return "$";
                      case "_":
                        return "_";
                      default:
                        throw this._fail();
                    }
                }.call(this);
            });
        },
        nameRest: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("nameFirst");
            }, function() {
                return this._apply("digit");
            });
        },
        iName: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._consumedBy(function() {
                this._apply("nameFirst");
                return this._many(function() {
                    return this._apply("nameRest");
                });
            });
        },
        isKeyword: function(x) {
            var _fromIdx = this.input.idx, $elf = this;
            return this._pred(BSJSParser._isKeyword(x));
        },
        isConstant: function(x) {
            var _fromIdx = this.input.idx, $elf = this;
            return this._pred(BSJSParser._isConstant(x));
        },
        constant: function() {
            var _fromIdx = this.input.idx, $elf = this, c;
            c = this._apply("iName");
            this._applyWithArgs("isConstant", c);
            return [ "name", c ];
        },
        name: function() {
            var _fromIdx = this.input.idx, $elf = this, n;
            n = this._apply("iName");
            this._not(function() {
                return this._or(function() {
                    return this._applyWithArgs("isKeyword", n);
                }, function() {
                    return this._applyWithArgs("isConstant", n);
                });
            });
            return [ "name", n == "self" ? "$elf" : n ];
        },
        keyword: function() {
            var _fromIdx = this.input.idx, $elf = this, k;
            k = this._apply("iName");
            this._applyWithArgs("isKeyword", k);
            return [ k, k ];
        },
        hexLit: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            this._applyWithArgs("exactly", "0");
            this._applyWithArgs("exactly", "x");
            "0x";
            x = this._consumedBy(function() {
                return this._many1(function() {
                    return this._apply("hexDigit");
                });
            });
            return parseInt(x, 16);
        },
        binLit: function() {
            var _fromIdx = this.input.idx, $elf = this, b;
            this._applyWithArgs("exactly", "0");
            this._applyWithArgs("exactly", "b");
            "0b";
            b = this._consumedBy(function() {
                return this._many1(function() {
                    return function() {
                        switch (this._apply("anything")) {
                          case "0":
                            return "0";
                          case "1":
                            return "1";
                          default:
                            throw this._fail();
                        }
                    }.call(this);
                });
            });
            return parseInt(b, 2);
        },
        decLit: function() {
            var _fromIdx = this.input.idx, f, $elf = this;
            f = this._consumedBy(function() {
                this._opt(function() {
                    return function() {
                        switch (this._apply("anything")) {
                          case "-":
                            return "-";
                          case "+":
                            return "+";
                          default:
                            throw this._fail();
                        }
                    }.call(this);
                });
                this._many1(function() {
                    return this._apply("digit");
                });
                this._opt(function() {
                    this._applyWithArgs("exactly", ".");
                    return this._many1(function() {
                        return this._apply("digit");
                    });
                });
                return this._opt(function() {
                    ((function() {
                        switch (this._apply("anything")) {
                          case "E":
                            return "E";
                          case "e":
                            return "e";
                          default:
                            throw this._fail();
                        }
                    })).call(this);
                    this._opt(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "-":
                                return "-";
                              case "+":
                                return "+";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    });
                    return this._many1(function() {
                        return this._apply("digit");
                    });
                });
            });
            return parseFloat(f);
        },
        number: function() {
            var _fromIdx = this.input.idx, $elf = this, n;
            n = this._or(function() {
                return this._apply("hexLit");
            }, function() {
                return this._apply("binLit");
            }, function() {
                return this._apply("decLit");
            });
            return [ "number", n ];
        },
        str: function() {
            var _fromIdx = this.input.idx, $elf = this, cs, n;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case '"':
                        return this._or(function() {
                            return function() {
                                switch (this._apply("anything")) {
                                  case '"':
                                    return function() {
                                        this._applyWithArgs("exactly", '"');
                                        '"""';
                                        cs = this._many(function() {
                                            return this._or(function() {
                                                return this._apply("escapedChar");
                                            }, function() {
                                                this._not(function() {
                                                    this._applyWithArgs("exactly", '"');
                                                    this._applyWithArgs("exactly", '"');
                                                    this._applyWithArgs("exactly", '"');
                                                    return '"""';
                                                });
                                                return this._apply("char");
                                            });
                                        });
                                        this._applyWithArgs("exactly", '"');
                                        this._applyWithArgs("exactly", '"');
                                        this._applyWithArgs("exactly", '"');
                                        '"""';
                                        return [ "string", cs.join("") ];
                                    }.call(this);
                                  default:
                                    throw this._fail();
                                }
                            }.call(this);
                        }, function() {
                            cs = this._many(function() {
                                return this._or(function() {
                                    return this._apply("escapedChar");
                                }, function() {
                                    this._not(function() {
                                        return this._applyWithArgs("exactly", '"');
                                    });
                                    return this._apply("char");
                                });
                            });
                            this._applyWithArgs("exactly", '"');
                            return [ "string", cs.join("") ];
                        });
                      case "'":
                        return function() {
                            cs = this._many(function() {
                                return this._or(function() {
                                    return this._apply("escapedChar");
                                }, function() {
                                    this._not(function() {
                                        return this._applyWithArgs("exactly", "'");
                                    });
                                    return this._apply("char");
                                });
                            });
                            this._applyWithArgs("exactly", "'");
                            return [ "string", cs.join("") ];
                        }.call(this);
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                ((function() {
                    switch (this._apply("anything")) {
                      case "`":
                        return "`";
                      case "#":
                        return "#";
                      default:
                        throw this._fail();
                    }
                })).call(this);
                n = this._apply("iName");
                return [ "string", n ];
            });
        },
        special: function() {
            var _fromIdx = this.input.idx, $elf = this, s;
            s = function() {
                switch (this._apply("anything")) {
                  case "{":
                    return "{";
                  case "/":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return "/=";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "/";
                    });
                  case "[":
                    return "[";
                  case ".":
                    return ".";
                  case "=":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return this._or(function() {
                                    return function() {
                                        switch (this._apply("anything")) {
                                          case "=":
                                            return "===";
                                          default:
                                            throw this._fail();
                                        }
                                    }.call(this);
                                }, function() {
                                    return "==";
                                });
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "=";
                    });
                  case ")":
                    return ")";
                  case "+":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return "+=";
                              case "+":
                                return "++";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "+";
                    });
                  case "<":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return "<=";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "<";
                    });
                  case "!":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return this._or(function() {
                                    return function() {
                                        switch (this._apply("anything")) {
                                          case "=":
                                            return "!==";
                                          default:
                                            throw this._fail();
                                        }
                                    }.call(this);
                                }, function() {
                                    return "!=";
                                });
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "!";
                    });
                  case "&":
                    return function() {
                        switch (this._apply("anything")) {
                          case "&":
                            return this._or(function() {
                                return function() {
                                    switch (this._apply("anything")) {
                                      case "=":
                                        return "&&=";
                                      default:
                                        throw this._fail();
                                    }
                                }.call(this);
                            }, function() {
                                return "&&";
                            });
                          default:
                            throw this._fail();
                        }
                    }.call(this);
                  case ":":
                    return ":";
                  case ";":
                    return ";";
                  case "?":
                    return "?";
                  case "}":
                    return "}";
                  case "-":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "-":
                                return "--";
                              case "=":
                                return "-=";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "-";
                    });
                  case ">":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return ">=";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return ">";
                    });
                  case ",":
                    return ",";
                  case "]":
                    return "]";
                  case "|":
                    return function() {
                        switch (this._apply("anything")) {
                          case "|":
                            return this._or(function() {
                                return function() {
                                    switch (this._apply("anything")) {
                                      case "=":
                                        return "||=";
                                      default:
                                        throw this._fail();
                                    }
                                }.call(this);
                            }, function() {
                                return "||";
                            });
                          default:
                            throw this._fail();
                        }
                    }.call(this);
                  case "%":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return "%=";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "%";
                    });
                  case "(":
                    return "(";
                  case "*":
                    return this._or(function() {
                        return function() {
                            switch (this._apply("anything")) {
                              case "=":
                                return "*=";
                              default:
                                throw this._fail();
                            }
                        }.call(this);
                    }, function() {
                        return "*";
                    });
                  default:
                    throw this._fail();
                }
            }.call(this);
            return [ s, s ];
        },
        tok: function() {
            var _fromIdx = this.input.idx, $elf = this;
            this._apply("spaces");
            return this._or(function() {
                return this._apply("name");
            }, function() {
                return this._apply("constant");
            }, function() {
                return this._apply("keyword");
            }, function() {
                return this._apply("special");
            }, function() {
                return this._apply("number");
            }, function() {
                return this._apply("str");
            });
        },
        toks: function() {
            var _fromIdx = this.input.idx, $elf = this, ts;
            ts = this._many(function() {
                return this._apply("token");
            });
            this._apply("spaces");
            this._apply("end");
            return ts;
        },
        token: function(tt) {
            var _fromIdx = this.input.idx, $elf = this, t;
            t = this._apply("tok");
            this._pred(t[0] == tt);
            return t[1];
        },
        spacesNoNl: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._many(function() {
                this._not(function() {
                    return this._applyWithArgs("exactly", "\n");
                });
                return this._apply("space");
            });
        },
        expr: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._apply("commaExpr");
        },
        commaExpr: function() {
            var _fromIdx = this.input.idx, e2, e1, $elf = this;
            return this._or(function() {
                e1 = this._apply("commaExpr");
                this._applyWithArgs("token", ",");
                e2 = this._apply("asgnExpr");
                return [ "binop", ",", e1, e2 ];
            }, function() {
                return this._apply("asgnExpr");
            });
        },
        asgnExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, e, rhs;
            e = this._apply("condExpr");
            return this._or(function() {
                this._applyWithArgs("token", "=");
                rhs = this._apply("asgnExpr");
                return [ "set", e, rhs ];
            }, function() {
                this._applyWithArgs("token", "+=");
                rhs = this._apply("asgnExpr");
                return [ "mset", e, "+", rhs ];
            }, function() {
                this._applyWithArgs("token", "-=");
                rhs = this._apply("asgnExpr");
                return [ "mset", e, "-", rhs ];
            }, function() {
                this._applyWithArgs("token", "*=");
                rhs = this._apply("asgnExpr");
                return [ "mset", e, "*", rhs ];
            }, function() {
                this._applyWithArgs("token", "/=");
                rhs = this._apply("asgnExpr");
                return [ "mset", e, "/", rhs ];
            }, function() {
                this._applyWithArgs("token", "%=");
                rhs = this._apply("asgnExpr");
                return [ "mset", e, "%", rhs ];
            }, function() {
                this._applyWithArgs("token", "&&=");
                rhs = this._apply("asgnExpr");
                return [ "mset", e, "&&", rhs ];
            }, function() {
                this._applyWithArgs("token", "||=");
                rhs = this._apply("asgnExpr");
                return [ "mset", e, "||", rhs ];
            }, function() {
                this._apply("empty");
                return e;
            });
        },
        condExpr: function() {
            var _fromIdx = this.input.idx, f, $elf = this, e, t;
            e = this._apply("orExpr");
            return this._or(function() {
                this._applyWithArgs("token", "?");
                t = this._apply("condExpr");
                this._applyWithArgs("token", ":");
                f = this._apply("condExpr");
                return [ "condExpr", e, t, f ];
            }, function() {
                this._apply("empty");
                return e;
            });
        },
        orExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            return this._or(function() {
                x = this._apply("orExpr");
                this._applyWithArgs("token", "||");
                y = this._apply("andExpr");
                return [ "binop", "||", x, y ];
            }, function() {
                return this._apply("andExpr");
            });
        },
        andExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            return this._or(function() {
                x = this._apply("andExpr");
                this._applyWithArgs("token", "&&");
                y = this._apply("eqExpr");
                return [ "binop", "&&", x, y ];
            }, function() {
                return this._apply("eqExpr");
            });
        },
        eqExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            return this._or(function() {
                x = this._apply("eqExpr");
                return this._or(function() {
                    this._applyWithArgs("token", "==");
                    y = this._apply("relExpr");
                    return [ "binop", "==", x, y ];
                }, function() {
                    this._applyWithArgs("token", "!=");
                    y = this._apply("relExpr");
                    return [ "binop", "!=", x, y ];
                }, function() {
                    this._applyWithArgs("token", "===");
                    y = this._apply("relExpr");
                    return [ "binop", "===", x, y ];
                }, function() {
                    this._applyWithArgs("token", "!==");
                    y = this._apply("relExpr");
                    return [ "binop", "!==", x, y ];
                });
            }, function() {
                return this._apply("relExpr");
            });
        },
        relExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            return this._or(function() {
                x = this._apply("relExpr");
                return this._or(function() {
                    this._applyWithArgs("token", ">");
                    y = this._apply("addExpr");
                    return [ "binop", ">", x, y ];
                }, function() {
                    this._applyWithArgs("token", ">=");
                    y = this._apply("addExpr");
                    return [ "binop", ">=", x, y ];
                }, function() {
                    this._applyWithArgs("token", "<");
                    y = this._apply("addExpr");
                    return [ "binop", "<", x, y ];
                }, function() {
                    this._applyWithArgs("token", "<=");
                    y = this._apply("addExpr");
                    return [ "binop", "<=", x, y ];
                }, function() {
                    this._applyWithArgs("token", "instanceof");
                    y = this._apply("addExpr");
                    return [ "binop", "instanceof", x, y ];
                });
            }, function() {
                return this._apply("addExpr");
            });
        },
        addExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            return this._or(function() {
                x = this._apply("addExpr");
                this._applyWithArgs("token", "+");
                y = this._apply("mulExpr");
                return [ "binop", "+", x, y ];
            }, function() {
                x = this._apply("addExpr");
                this._applyWithArgs("token", "-");
                y = this._apply("mulExpr");
                return [ "binop", "-", x, y ];
            }, function() {
                return this._apply("mulExpr");
            });
        },
        mulExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            return this._or(function() {
                x = this._apply("mulExpr");
                this._applyWithArgs("token", "*");
                y = this._apply("unary");
                return [ "binop", "*", x, y ];
            }, function() {
                x = this._apply("mulExpr");
                this._applyWithArgs("token", "/");
                y = this._apply("unary");
                return [ "binop", "/", x, y ];
            }, function() {
                x = this._apply("mulExpr");
                this._applyWithArgs("token", "%");
                y = this._apply("unary");
                return [ "binop", "%", x, y ];
            }, function() {
                return this._apply("unary");
            });
        },
        unary: function() {
            var _fromIdx = this.input.idx, $elf = this, p;
            return this._or(function() {
                this._applyWithArgs("token", "-");
                p = this._apply("postfix");
                return [ "unop", "-", p ];
            }, function() {
                this._applyWithArgs("token", "+");
                p = this._apply("postfix");
                return [ "unop", "+", p ];
            }, function() {
                this._applyWithArgs("token", "++");
                p = this._apply("postfix");
                return [ "preop", "++", p ];
            }, function() {
                this._applyWithArgs("token", "--");
                p = this._apply("postfix");
                return [ "preop", "--", p ];
            }, function() {
                this._applyWithArgs("token", "!");
                p = this._apply("unary");
                return [ "unop", "!", p ];
            }, function() {
                this._applyWithArgs("token", "void");
                p = this._apply("unary");
                return [ "unop", "void", p ];
            }, function() {
                this._applyWithArgs("token", "delete");
                p = this._apply("unary");
                return [ "unop", "delete", p ];
            }, function() {
                this._applyWithArgs("token", "typeof");
                p = this._apply("unary");
                return [ "unop", "typeof", p ];
            }, function() {
                return this._apply("postfix");
            });
        },
        postfix: function() {
            var _fromIdx = this.input.idx, $elf = this, p;
            p = this._apply("primExpr");
            return this._or(function() {
                this._apply("spacesNoNl");
                this._applyWithArgs("token", "++");
                return [ "postop", "++", p ];
            }, function() {
                this._apply("spacesNoNl");
                this._applyWithArgs("token", "--");
                return [ "postop", "--", p ];
            }, function() {
                this._apply("empty");
                return p;
            });
        },
        primExpr: function() {
            var _fromIdx = this.input.idx, i, as, $elf = this, f, m, p;
            return this._or(function() {
                p = this._apply("primExpr");
                return this._or(function() {
                    this._applyWithArgs("token", "[");
                    i = this._apply("expr");
                    this._applyWithArgs("token", "]");
                    return [ "getp", i, p ];
                }, function() {
                    this._applyWithArgs("token", ".");
                    m = this._applyWithArgs("token", "name");
                    this._applyWithArgs("token", "(");
                    as = this._applyWithArgs("listOf", "asgnExpr", ",");
                    this._applyWithArgs("token", ")");
                    return [ "send", m, p ].concat(as);
                }, function() {
                    this._applyWithArgs("token", ".");
                    this._apply("spaces");
                    m = this._apply("iName");
                    this._applyWithArgs("token", "(");
                    as = this._applyWithArgs("listOf", "asgnExpr", ",");
                    this._applyWithArgs("token", ")");
                    this._applyWithArgs("isKeyword", m);
                    return [ "send", m, p ].concat(as);
                }, function() {
                    this._applyWithArgs("token", ".");
                    f = this._applyWithArgs("token", "name");
                    return [ "getp", [ "string", f ], p ];
                }, function() {
                    this._applyWithArgs("token", ".");
                    this._apply("spaces");
                    f = this._apply("iName");
                    this._applyWithArgs("isKeyword", f);
                    return [ "getp", [ "string", f ], p ];
                }, function() {
                    this._applyWithArgs("token", "(");
                    as = this._applyWithArgs("listOf", "asgnExpr", ",");
                    this._applyWithArgs("token", ")");
                    return [ "call", p ].concat(as);
                });
            }, function() {
                return this._apply("primExprHd");
            });
        },
        primExprHd: function() {
            var _fromIdx = this.input.idx, as, $elf = this, e, es, s, n;
            return this._or(function() {
                this._applyWithArgs("token", "(");
                e = this._apply("expr");
                this._applyWithArgs("token", ")");
                return e;
            }, function() {
                this._applyWithArgs("token", "this");
                return [ "this" ];
            }, function() {
                n = this._applyWithArgs("token", "name");
                return [ "get", n ];
            }, function() {
                n = this._applyWithArgs("token", "number");
                return [ "number", n ];
            }, function() {
                s = this._applyWithArgs("token", "string");
                return [ "string", s ];
            }, function() {
                this._applyWithArgs("token", "function");
                return this._apply("funcRest");
            }, function() {
                this._applyWithArgs("token", "new");
                n = this._applyWithArgs("token", "name");
                this._applyWithArgs("token", "(");
                as = this._applyWithArgs("listOf", "asgnExpr", ",");
                this._applyWithArgs("token", ")");
                return [ "new", n ].concat(as);
            }, function() {
                this._applyWithArgs("token", "[");
                es = this._applyWithArgs("listOf", "asgnExpr", ",");
                this._applyWithArgs("token", "]");
                return [ "arr" ].concat(es);
            }, function() {
                return this._apply("json");
            }, function() {
                return this._apply("regExp");
            });
        },
        json: function() {
            var _fromIdx = this.input.idx, $elf = this, bs;
            this._applyWithArgs("token", "{");
            bs = this._applyWithArgs("listOf", "jsonBinding", ",");
            this._applyWithArgs("token", "}");
            return [ "json" ].concat(bs);
        },
        jsonBinding: function() {
            var _fromIdx = this.input.idx, $elf = this, v, n;
            n = this._apply("jsonPropName");
            this._applyWithArgs("token", ":");
            v = this._apply("asgnExpr");
            return [ "binding", n, v ];
        },
        jsonPropName: function() {
            var _fromIdx = this.input.idx, $elf = this, n;
            return this._or(function() {
                return this._applyWithArgs("token", "name");
            }, function() {
                return this._applyWithArgs("token", "number");
            }, function() {
                return this._applyWithArgs("token", "string");
            }, function() {
                this._apply("spaces");
                n = this._apply("iName");
                this._applyWithArgs("isKeyword", n);
                return n;
            });
        },
        regExp: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            this._apply("spaces");
            x = this._consumedBy(function() {
                this._applyWithArgs("exactly", "/");
                this._apply("regExpBody");
                this._applyWithArgs("exactly", "/");
                return this._many(function() {
                    return this._apply("regExpFlag");
                });
            });
            return [ "regExp", x ];
        },
        regExpBody: function() {
            var _fromIdx = this.input.idx, $elf = this;
            this._not(function() {
                return this._applyWithArgs("exactly", "*");
            });
            return this._many1(function() {
                return this._apply("regExpChar");
            });
        },
        regExpChar: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("regExpClass");
            }, function() {
                this._not(function() {
                    return function() {
                        switch (this._apply("anything")) {
                          case "/":
                            return "/";
                          case "[":
                            return "[";
                          default:
                            throw this._fail();
                        }
                    }.call(this);
                });
                return this._apply("regExpNonTerm");
            });
        },
        regExpNonTerm: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("escapedChar");
            }, function() {
                this._not(function() {
                    return function() {
                        switch (this._apply("anything")) {
                          case "\n":
                            return "\n";
                          case "\r":
                            return "\r";
                          default:
                            throw this._fail();
                        }
                    }.call(this);
                });
                return this._apply("char");
            });
        },
        regExpClass: function() {
            var _fromIdx = this.input.idx, $elf = this;
            this._applyWithArgs("exactly", "[");
            this._many(function() {
                return this._apply("regExpClassChar");
            });
            return this._applyWithArgs("exactly", "]");
        },
        regExpClassChar: function() {
            var _fromIdx = this.input.idx, $elf = this;
            this._not(function() {
                return this._applyWithArgs("exactly", "]");
            });
            return this._apply("regExpNonTerm");
        },
        regExpFlag: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._apply("nameFirst");
        },
        formal: function() {
            var _fromIdx = this.input.idx, $elf = this;
            this._apply("spaces");
            return this._applyWithArgs("token", "name");
        },
        funcRest: function() {
            var _fromIdx = this.input.idx, $elf = this, fs, body;
            this._applyWithArgs("token", "(");
            fs = this._applyWithArgs("listOf", "formal", ",");
            this._applyWithArgs("token", ")");
            this._applyWithArgs("token", "{");
            body = this._apply("srcElems");
            this._applyWithArgs("token", "}");
            return [ "func", fs, body ];
        },
        sc: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                this._apply("spacesNoNl");
                return this._or(function() {
                    return function() {
                        switch (this._apply("anything")) {
                          case "\n":
                            return "\n";
                          default:
                            throw this._fail();
                        }
                    }.call(this);
                }, function() {
                    return this._lookahead(function() {
                        return this._applyWithArgs("exactly", "}");
                    });
                }, function() {
                    return this._apply("end");
                });
            }, function() {
                return this._applyWithArgs("token", ";");
            });
        },
        binding: function() {
            var _fromIdx = this.input.idx, $elf = this, v, n;
            n = this._applyWithArgs("token", "name");
            this._not(function() {
                return this._applyWithArgs("isConstant", n);
            });
            return this._or(function() {
                this._applyWithArgs("token", "=");
                v = this._apply("asgnExpr");
                return [ n, v ];
            }, function() {
                return [ n ];
            });
        },
        block: function() {
            var _fromIdx = this.input.idx, $elf = this, ss;
            this._applyWithArgs("token", "{");
            ss = this._apply("srcElems");
            this._applyWithArgs("token", "}");
            return ss;
        },
        vars: function() {
            var _fromIdx = this.input.idx, $elf = this, bs;
            this._applyWithArgs("token", "var");
            bs = this._applyWithArgs("listOf", "binding", ",");
            return [ "var" ].concat(bs);
        },
        stmt: function() {
            var _fromIdx = this.input.idx, f, i, $elf = this, t, e, b, cs, v, u, x, bs, c, s;
            return this._or(function() {
                return this._apply("block");
            }, function() {
                bs = this._apply("vars");
                this._apply("sc");
                return bs;
            }, function() {
                this._applyWithArgs("token", "if");
                this._applyWithArgs("token", "(");
                c = this._apply("expr");
                this._applyWithArgs("token", ")");
                t = this._apply("stmt");
                f = this._or(function() {
                    this._applyWithArgs("token", "else");
                    return this._apply("stmt");
                }, function() {
                    this._apply("empty");
                    return [ "get", "undefined" ];
                });
                return [ "if", c, t, f ];
            }, function() {
                this._applyWithArgs("token", "while");
                this._applyWithArgs("token", "(");
                c = this._apply("expr");
                this._applyWithArgs("token", ")");
                s = this._apply("stmt");
                return [ "while", c, s ];
            }, function() {
                this._applyWithArgs("token", "do");
                s = this._apply("stmt");
                this._applyWithArgs("token", "while");
                this._applyWithArgs("token", "(");
                c = this._apply("expr");
                this._applyWithArgs("token", ")");
                this._apply("sc");
                return [ "doWhile", s, c ];
            }, function() {
                this._applyWithArgs("token", "for");
                this._applyWithArgs("token", "(");
                i = this._or(function() {
                    return this._apply("vars");
                }, function() {
                    return this._apply("expr");
                }, function() {
                    this._apply("empty");
                    return [ "get", "undefined" ];
                });
                this._applyWithArgs("token", ";");
                c = this._or(function() {
                    return this._apply("expr");
                }, function() {
                    this._apply("empty");
                    return [ "get", "true" ];
                });
                this._applyWithArgs("token", ";");
                u = this._or(function() {
                    return this._apply("expr");
                }, function() {
                    this._apply("empty");
                    return [ "get", "undefined" ];
                });
                this._applyWithArgs("token", ")");
                s = this._apply("stmt");
                return [ "for", i, c, u, s ];
            }, function() {
                this._applyWithArgs("token", "for");
                this._applyWithArgs("token", "(");
                v = this._or(function() {
                    this._applyWithArgs("token", "var");
                    b = this._apply("binding");
                    return [ "var", b ];
                }, function() {
                    return this._apply("expr");
                });
                this._applyWithArgs("token", "in");
                e = this._apply("asgnExpr");
                this._applyWithArgs("token", ")");
                s = this._apply("stmt");
                return [ "forIn", v, e, s ];
            }, function() {
                this._applyWithArgs("token", "switch");
                this._applyWithArgs("token", "(");
                e = this._apply("expr");
                this._applyWithArgs("token", ")");
                this._applyWithArgs("token", "{");
                cs = this._many(function() {
                    return this._or(function() {
                        this._applyWithArgs("token", "case");
                        c = this._apply("asgnExpr");
                        this._applyWithArgs("token", ":");
                        cs = this._apply("srcElems");
                        return [ "case", c, cs ];
                    }, function() {
                        this._applyWithArgs("token", "default");
                        this._applyWithArgs("token", ":");
                        cs = this._apply("srcElems");
                        return [ "default", cs ];
                    });
                });
                this._applyWithArgs("token", "}");
                return [ "switch", e ].concat(cs);
            }, function() {
                this._applyWithArgs("token", "break");
                this._apply("sc");
                return [ "break" ];
            }, function() {
                this._applyWithArgs("token", "continue");
                this._apply("sc");
                return [ "continue" ];
            }, function() {
                this._applyWithArgs("token", "throw");
                this._apply("spacesNoNl");
                e = this._apply("asgnExpr");
                this._apply("sc");
                return [ "throw", e ];
            }, function() {
                this._applyWithArgs("token", "try");
                t = this._apply("block");
                this._applyWithArgs("token", "catch");
                this._applyWithArgs("token", "(");
                e = this._applyWithArgs("token", "name");
                this._applyWithArgs("token", ")");
                c = this._apply("block");
                f = this._or(function() {
                    this._applyWithArgs("token", "finally");
                    return this._apply("block");
                }, function() {
                    this._apply("empty");
                    return [ "get", "undefined" ];
                });
                return [ "try", t, e, c, f ];
            }, function() {
                this._applyWithArgs("token", "return");
                e = this._or(function() {
                    return this._apply("expr");
                }, function() {
                    this._apply("empty");
                    return [ "get", "undefined" ];
                });
                this._apply("sc");
                return [ "return", e ];
            }, function() {
                this._applyWithArgs("token", "with");
                this._applyWithArgs("token", "(");
                x = this._apply("expr");
                this._applyWithArgs("token", ")");
                s = this._apply("stmt");
                return [ "with", x, s ];
            }, function() {
                e = this._apply("expr");
                this._apply("sc");
                return e;
            }, function() {
                this._applyWithArgs("token", ";");
                return [ "get", "undefined" ];
            });
        },
        srcElem: function() {
            var _fromIdx = this.input.idx, f, $elf = this, n;
            return this._or(function() {
                this._applyWithArgs("token", "function");
                n = this._applyWithArgs("token", "name");
                f = this._apply("funcRest");
                return [ "var", [ n, f ] ];
            }, function() {
                return this._apply("stmt");
            });
        },
        srcElems: function() {
            var _fromIdx = this.input.idx, $elf = this, ss;
            ss = this._many(function() {
                return this._apply("srcElem");
            });
            return [ "begin" ].concat(ss);
        },
        topLevel: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            r = this._apply("srcElems");
            this._apply("spaces");
            this._apply("end");
            return r;
        }
    });
    BSJSParser["_enableTokens"] = function() {
        OMeta["_enableTokens"].call(this, [ "keyword", "str", "comment", "hexLit", "binLit", "decLit", "constant", "regExp" ]);
    };
    var keywords = [ "break", "case", "catch", "continue", "default", "delete", "do", "else", "finally", "for", "function", "if", "in", "instanceof", "new", "return", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "ometa" ];
    BSJSParser["_isKeyword"] = function(k) {
        return keywords.indexOf(k) !== -1;
    };
    var constants = [ "true", "false", "undefined" ];
    BSJSParser["_isConstant"] = function(c) {
        return constants.indexOf(c) !== -1;
    };
    var BSSemActionParser = exports.BSSemActionParser = BSJSParser._extend({
        curlySemAction: function() {
            var _fromIdx = this.input.idx, r, $elf = this, ss, s;
            return this._or(function() {
                this._applyWithArgs("token", "{");
                r = this._apply("asgnExpr");
                this._apply("sc");
                this._applyWithArgs("token", "}");
                this._apply("spaces");
                return r;
            }, function() {
                this._applyWithArgs("token", "{");
                ss = this._many(function() {
                    s = this._apply("srcElem");
                    this._lookahead(function() {
                        return this._apply("srcElem");
                    });
                    return s;
                });
                s = this._or(function() {
                    r = this._apply("asgnExpr");
                    this._apply("sc");
                    return [ "return", r ];
                }, function() {
                    return this._apply("srcElem");
                });
                ss.push(s);
                this._applyWithArgs("token", "}");
                this._apply("spaces");
                return [ "send", "call", [ "func", [], [ "begin" ].concat(ss) ], [ "this" ] ];
            });
        },
        semAction: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            return this._or(function() {
                return this._apply("curlySemAction");
            }, function() {
                r = this._apply("primExpr");
                this._apply("spaces");
                return r;
            });
        }
    });
    var BSJSIdentity = exports.BSJSIdentity = OMeta._extend({
        trans: function() {
            var _fromIdx = this.input.idx, $elf = this, t, ans;
            return this._or(function() {
                this._form(function() {
                    t = this._apply("anything");
                    return ans = this._applyWithArgs("apply", t);
                });
                return ans;
            }, function() {
                this._form(function() {
                    return t = this._apply("anything");
                });
                return t;
            });
        },
        curlyTrans: function() {
            var _fromIdx = this.input.idx, r, $elf = this, rs;
            return this._or(function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "begin");
                    return r = this._apply("curlyTrans");
                });
                return [ "begin", r ];
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "begin");
                    return rs = this._many(function() {
                        return this._apply("trans");
                    });
                });
                return [ "begin" ].concat(rs);
            }, function() {
                r = this._apply("trans");
                return r;
            });
        },
        "this": function() {
            var _fromIdx = this.input.idx, $elf = this;
            return [ "this" ];
        },
        "break": function() {
            var _fromIdx = this.input.idx, $elf = this;
            return [ "break" ];
        },
        "continue": function() {
            var _fromIdx = this.input.idx, $elf = this;
            return [ "continue" ];
        },
        number: function() {
            var _fromIdx = this.input.idx, $elf = this, n;
            n = this._apply("anything");
            return [ "number", n ];
        },
        string: function() {
            var _fromIdx = this.input.idx, $elf = this, s;
            s = this._apply("anything");
            return [ "string", s ];
        },
        regExp: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("anything");
            return [ "regExp", x ];
        },
        arr: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("trans");
            });
            return [ "arr" ].concat(xs);
        },
        unop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x;
            op = this._apply("anything");
            x = this._apply("trans");
            return [ "unop", op, x ];
        },
        get: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("anything");
            return [ "get", x ];
        },
        getp: function() {
            var _fromIdx = this.input.idx, $elf = this, fd, x;
            fd = this._apply("trans");
            x = this._apply("trans");
            return [ "getp", fd, x ];
        },
        set: function() {
            var _fromIdx = this.input.idx, $elf = this, rhs, lhs;
            lhs = this._apply("trans");
            rhs = this._apply("trans");
            return [ "set", lhs, rhs ];
        },
        mset: function() {
            var _fromIdx = this.input.idx, $elf = this, op, rhs, lhs;
            lhs = this._apply("trans");
            op = this._apply("anything");
            rhs = this._apply("trans");
            return [ "mset", lhs, op, rhs ];
        },
        binop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x, y;
            op = this._apply("anything");
            x = this._apply("trans");
            y = this._apply("trans");
            return [ "binop", op, x, y ];
        },
        preop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x;
            op = this._apply("anything");
            x = this._apply("trans");
            return [ "preop", op, x ];
        },
        postop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x;
            op = this._apply("anything");
            x = this._apply("trans");
            return [ "postop", op, x ];
        },
        "return": function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "return", x ];
        },
        "with": function() {
            var _fromIdx = this.input.idx, $elf = this, x, s;
            x = this._apply("trans");
            s = this._apply("curlyTrans");
            return [ "with", x, s ];
        },
        "if": function() {
            var _fromIdx = this.input.idx, $elf = this, t, e, cond;
            cond = this._apply("trans");
            t = this._apply("curlyTrans");
            e = this._apply("curlyTrans");
            return [ "if", cond, t, e ];
        },
        condExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, t, e, cond;
            cond = this._apply("trans");
            t = this._apply("trans");
            e = this._apply("trans");
            return [ "condExpr", cond, t, e ];
        },
        "while": function() {
            var _fromIdx = this.input.idx, $elf = this, body, cond;
            cond = this._apply("trans");
            body = this._apply("curlyTrans");
            return [ "while", cond, body ];
        },
        doWhile: function() {
            var _fromIdx = this.input.idx, $elf = this, body, cond;
            body = this._apply("curlyTrans");
            cond = this._apply("trans");
            return [ "doWhile", body, cond ];
        },
        "for": function() {
            var _fromIdx = this.input.idx, $elf = this, init, cond, body, upd;
            init = this._apply("trans");
            cond = this._apply("trans");
            upd = this._apply("trans");
            body = this._apply("curlyTrans");
            return [ "for", init, cond, upd, body ];
        },
        forIn: function() {
            var _fromIdx = this.input.idx, $elf = this, arr, x, body;
            x = this._apply("trans");
            arr = this._apply("trans");
            body = this._apply("curlyTrans");
            return [ "forIn", x, arr, body ];
        },
        begin: function() {
            var _fromIdx = this.input.idx, $elf = this, x, xs;
            return this._or(function() {
                x = this._apply("trans");
                this._apply("end");
                return [ "begin", x ];
            }, function() {
                xs = this._many(function() {
                    return this._apply("trans");
                });
                return [ "begin" ].concat(xs);
            });
        },
        func: function() {
            var _fromIdx = this.input.idx, $elf = this, body, args;
            args = this._apply("anything");
            body = this._apply("curlyTrans");
            return [ "func", args, body ];
        },
        call: function() {
            var _fromIdx = this.input.idx, $elf = this, args, fn;
            fn = this._apply("trans");
            args = this._many(function() {
                return this._apply("trans");
            });
            return [ "call", fn ].concat(args);
        },
        send: function() {
            var msg, _fromIdx = this.input.idx, $elf = this, recv, args;
            msg = this._apply("anything");
            recv = this._apply("trans");
            args = this._many(function() {
                return this._apply("trans");
            });
            return [ "send", msg, recv ].concat(args);
        },
        "new": function() {
            var _fromIdx = this.input.idx, $elf = this, args, cls;
            cls = this._apply("anything");
            args = this._many(function() {
                return this._apply("trans");
            });
            return [ "new", cls ].concat(args);
        },
        "var": function() {
            var _fromIdx = this.input.idx, $elf = this, vs;
            vs = this._many1(function() {
                return this._apply("varItem");
            });
            return [ "var" ].concat(vs);
        },
        varItem: function() {
            var _fromIdx = this.input.idx, $elf = this, v, n;
            return this._or(function() {
                this._form(function() {
                    n = this._apply("anything");
                    return v = this._apply("trans");
                });
                return [ n, v ];
            }, function() {
                this._form(function() {
                    return n = this._apply("anything");
                });
                return [ n ];
            });
        },
        "throw": function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "throw", x ];
        },
        "try": function() {
            var _fromIdx = this.input.idx, f, $elf = this, x, name, c;
            x = this._apply("curlyTrans");
            name = this._apply("anything");
            c = this._apply("curlyTrans");
            f = this._apply("curlyTrans");
            return [ "try", x, name, c, f ];
        },
        json: function() {
            var _fromIdx = this.input.idx, props, $elf = this;
            props = this._many(function() {
                return this._apply("trans");
            });
            return [ "json" ].concat(props);
        },
        binding: function() {
            var _fromIdx = this.input.idx, val, $elf = this, name;
            name = this._apply("anything");
            val = this._apply("trans");
            return [ "binding", name, val ];
        },
        "switch": function() {
            var _fromIdx = this.input.idx, $elf = this, cases, x;
            x = this._apply("trans");
            cases = this._many(function() {
                return this._apply("trans");
            });
            return [ "switch", x ].concat(cases);
        },
        "case": function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            x = this._apply("trans");
            y = this._apply("trans");
            return [ "case", x, y ];
        },
        "default": function() {
            var _fromIdx = this.input.idx, $elf = this, y;
            y = this._apply("trans");
            return [ "default", y ];
        }
    });
    var BSJSTranslator = exports.BSJSTranslator = OMeta._extend({
        trans: function() {
            var _fromIdx = this.input.idx, $elf = this, t, ans;
            this._form(function() {
                t = this._apply("anything");
                return ans = this._applyWithArgs("apply", t);
            });
            return ans;
        },
        curlyTrans: function() {
            var _fromIdx = this.input.idx, r, $elf = this, rs;
            return this._or(function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "begin");
                    return r = this._apply("curlyTrans");
                });
                return r;
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "begin");
                    return rs = this._many(function() {
                        return this._apply("trans");
                    });
                });
                return "{" + rs.join(";") + "}";
            }, function() {
                r = this._apply("trans");
                return "{" + r + "}";
            });
        },
        "this": function() {
            var _fromIdx = this.input.idx, $elf = this;
            return "this";
        },
        "break": function() {
            var _fromIdx = this.input.idx, $elf = this;
            return "break";
        },
        "continue": function() {
            var _fromIdx = this.input.idx, $elf = this;
            return "continue";
        },
        number: function() {
            var _fromIdx = this.input.idx, $elf = this, n;
            n = this._apply("anything");
            return "(" + n + ")";
        },
        string: function() {
            var _fromIdx = this.input.idx, $elf = this, s;
            s = this._apply("anything");
            return JSON.stringify(s);
        },
        regExp: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("anything");
            return x;
        },
        arr: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("trans");
            });
            return "[" + xs.join(",") + "]";
        },
        unop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x;
            op = this._apply("anything");
            x = this._apply("trans");
            return "(" + op + " " + x + ")";
        },
        getp: function() {
            var _fromIdx = this.input.idx, $elf = this, fd, x;
            fd = this._apply("trans");
            x = this._apply("trans");
            return x + "[" + fd + "]";
        },
        get: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("anything");
            return x;
        },
        set: function() {
            var _fromIdx = this.input.idx, $elf = this, rhs, lhs;
            lhs = this._apply("trans");
            rhs = this._apply("trans");
            return "(" + lhs + "=" + rhs + ")";
        },
        mset: function() {
            var _fromIdx = this.input.idx, $elf = this, op, rhs, lhs;
            lhs = this._apply("trans");
            op = this._apply("anything");
            rhs = this._apply("trans");
            return "(" + lhs + op + "=" + rhs + ")";
        },
        binop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x, y;
            op = this._apply("anything");
            x = this._apply("trans");
            y = this._apply("trans");
            return "(" + x + " " + op + " " + y + ")";
        },
        preop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x;
            op = this._apply("anything");
            x = this._apply("trans");
            return op + x;
        },
        postop: function() {
            var _fromIdx = this.input.idx, $elf = this, op, x;
            op = this._apply("anything");
            x = this._apply("trans");
            return x + op;
        },
        "return": function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return "return " + x;
        },
        "with": function() {
            var _fromIdx = this.input.idx, $elf = this, x, s;
            x = this._apply("trans");
            s = this._apply("curlyTrans");
            return "with(" + x + ")" + s;
        },
        "if": function() {
            var _fromIdx = this.input.idx, $elf = this, t, e, cond;
            cond = this._apply("trans");
            t = this._apply("curlyTrans");
            e = this._apply("curlyTrans");
            return "if(" + cond + ")" + t + "else" + e;
        },
        condExpr: function() {
            var _fromIdx = this.input.idx, $elf = this, t, e, cond;
            cond = this._apply("trans");
            t = this._apply("trans");
            e = this._apply("trans");
            return "(" + cond + "?" + t + ":" + e + ")";
        },
        "while": function() {
            var _fromIdx = this.input.idx, $elf = this, body, cond;
            cond = this._apply("trans");
            body = this._apply("curlyTrans");
            return "while(" + cond + ")" + body;
        },
        doWhile: function() {
            var _fromIdx = this.input.idx, $elf = this, body, cond;
            body = this._apply("curlyTrans");
            cond = this._apply("trans");
            return "do" + body + "while(" + cond + ")";
        },
        "for": function() {
            var _fromIdx = this.input.idx, $elf = this, init, cond, body, upd;
            init = this._apply("trans");
            cond = this._apply("trans");
            upd = this._apply("trans");
            body = this._apply("curlyTrans");
            return "for(" + init + ";" + cond + ";" + upd + ")" + body;
        },
        forIn: function() {
            var _fromIdx = this.input.idx, $elf = this, arr, x, body;
            x = this._apply("trans");
            arr = this._apply("trans");
            body = this._apply("curlyTrans");
            return "for(" + x + " in " + arr + ")" + body;
        },
        begin: function() {
            var _fromIdx = this.input.idx, $elf = this, x, xs;
            return this._or(function() {
                x = this._apply("trans");
                this._apply("end");
                return x;
            }, function() {
                xs = this._many(function() {
                    x = this._apply("trans");
                    return this._or(function() {
                        this._or(function() {
                            return this._pred(x[x["length"] - 1] == "}");
                        }, function() {
                            return this._apply("end");
                        });
                        return x;
                    }, function() {
                        this._apply("empty");
                        return x + ";";
                    });
                });
                return "{" + xs.join("") + "}";
            });
        },
        func: function() {
            var _fromIdx = this.input.idx, $elf = this, body, args;
            args = this._apply("anything");
            body = this._apply("curlyTrans");
            return "(function (" + args.join(",") + ")" + body + ")";
        },
        call: function() {
            var _fromIdx = this.input.idx, $elf = this, args, fn;
            fn = this._apply("trans");
            args = this._many(function() {
                return this._apply("trans");
            });
            return fn + "(" + args.join(",") + ")";
        },
        send: function() {
            var msg, _fromIdx = this.input.idx, $elf = this, recv, args;
            msg = this._apply("anything");
            recv = this._apply("trans");
            args = this._many(function() {
                return this._apply("trans");
            });
            return recv + "." + msg + "(" + args.join(",") + ")";
        },
        "new": function() {
            var _fromIdx = this.input.idx, $elf = this, args, cls;
            cls = this._apply("anything");
            args = this._many(function() {
                return this._apply("trans");
            });
            return "new " + cls + "(" + args.join(",") + ")";
        },
        "var": function() {
            var _fromIdx = this.input.idx, $elf = this, vs;
            vs = this._many1(function() {
                return this._apply("varItem");
            });
            return "var " + vs.join(",");
        },
        varItem: function() {
            var _fromIdx = this.input.idx, $elf = this, v, n;
            return this._or(function() {
                this._form(function() {
                    n = this._apply("anything");
                    return v = this._apply("trans");
                });
                return n + " = " + v;
            }, function() {
                this._form(function() {
                    return n = this._apply("anything");
                });
                return n;
            });
        },
        "throw": function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return "throw " + x;
        },
        "try": function() {
            var _fromIdx = this.input.idx, f, $elf = this, x, name, c;
            x = this._apply("curlyTrans");
            name = this._apply("anything");
            c = this._apply("curlyTrans");
            f = this._apply("curlyTrans");
            return "try " + x + "catch(" + name + ")" + c + "finally" + f;
        },
        json: function() {
            var _fromIdx = this.input.idx, props, $elf = this;
            props = this._many(function() {
                return this._apply("trans");
            });
            return "({" + props.join(",") + "})";
        },
        binding: function() {
            var _fromIdx = this.input.idx, val, $elf = this, name;
            name = this._apply("anything");
            val = this._apply("trans");
            return JSON.stringify(name) + ": " + val;
        },
        "switch": function() {
            var _fromIdx = this.input.idx, $elf = this, cases, x;
            x = this._apply("trans");
            cases = this._many(function() {
                return this._apply("trans");
            });
            return "switch(" + x + "){" + cases.join(";") + "}";
        },
        "case": function() {
            var _fromIdx = this.input.idx, $elf = this, x, y;
            x = this._apply("trans");
            y = this._apply("trans");
            return "case " + x + ": " + y;
        },
        "default": function() {
            var _fromIdx = this.input.idx, $elf = this, y;
            y = this._apply("trans");
            return "default: " + y;
        }
    });
    var BSOMetaParser = exports.BSOMetaParser = OMeta._extend({
        space: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return OMeta._superApplyWithArgs(this, "space");
            }, function() {
                return this._applyWithArgs("fromTo", "//", "\n");
            }, function() {
                return this._applyWithArgs("fromTo", "/*", "*/");
            });
        },
        nameFirst: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case "$":
                        return "$";
                      case "_":
                        return "_";
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                return this._apply("letter");
            });
        },
        nameRest: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("nameFirst");
            }, function() {
                return this._apply("digit");
            });
        },
        tsName: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._consumedBy(function() {
                this._apply("nameFirst");
                return this._many(function() {
                    return this._apply("nameRest");
                });
            });
        },
        name: function() {
            var _fromIdx = this.input.idx, $elf = this;
            this._apply("spaces");
            return this._apply("tsName");
        },
        eChar: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("escapedChar");
            }, function() {
                return this._apply("char");
            });
        },
        tsString: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            this._applyWithArgs("exactly", "'");
            xs = this._many(function() {
                this._not(function() {
                    return this._applyWithArgs("exactly", "'");
                });
                return this._apply("eChar");
            });
            this._applyWithArgs("exactly", "'");
            return xs.join("");
        },
        seqString: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            this._applyWithArgs("exactly", "`");
            this._applyWithArgs("exactly", "`");
            xs = this._many(function() {
                this._not(function() {
                    this._applyWithArgs("exactly", "'");
                    return this._applyWithArgs("exactly", "'");
                });
                return this._apply("eChar");
            });
            this._applyWithArgs("exactly", "'");
            this._applyWithArgs("exactly", "'");
            return [ "App", "seq", JSON.stringify(xs.join("")) ];
        },
        tokenString: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            this._applyWithArgs("exactly", '"');
            xs = this._many(function() {
                this._not(function() {
                    return this._applyWithArgs("exactly", '"');
                });
                return this._apply("eChar");
            });
            this._applyWithArgs("exactly", '"');
            return [ "App", "token", JSON.stringify(xs.join("")) ];
        },
        string: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._or(function() {
                ((function() {
                    switch (this._apply("anything")) {
                      case "`":
                        return "`";
                      case "#":
                        return "#";
                      default:
                        throw this._fail();
                    }
                })).call(this);
                return this._apply("tsName");
            }, function() {
                return this._apply("tsString");
            });
            return [ "App", "exactly", JSON.stringify(xs) ];
        },
        number: function() {
            var _fromIdx = this.input.idx, $elf = this, n;
            n = this._consumedBy(function() {
                this._opt(function() {
                    return this._applyWithArgs("exactly", "-");
                });
                return this._many1(function() {
                    return this._apply("digit");
                });
            });
            return [ "App", "exactly", n ];
        },
        keyword: function(xs) {
            var _fromIdx = this.input.idx, $elf = this;
            this._applyWithArgs("token", xs);
            this._not(function() {
                return this._apply("letterOrDigit");
            });
            return xs;
        },
        args: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case "(":
                        return function() {
                            xs = this._applyWithArgs("listOf", "hostExpr", ",");
                            this._applyWithArgs("token", ")");
                            return xs;
                        }.call(this);
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                this._apply("empty");
                return [];
            });
        },
        application: function() {
            var _fromIdx = this.input.idx, rule, as, $elf = this, grm;
            return this._or(function() {
                this._applyWithArgs("token", "^");
                rule = this._apply("name");
                as = this._apply("args");
                return [ "App", "super", "'" + rule + "'" ].concat(as);
            }, function() {
                grm = this._apply("name");
                this._applyWithArgs("token", ".");
                rule = this._apply("name");
                as = this._apply("args");
                return [ "App", "foreign", grm, "'" + rule + "'" ].concat(as);
            }, function() {
                rule = this._apply("name");
                as = this._apply("args");
                return [ "App", rule ].concat(as);
            });
        },
        hostExpr: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            r = this._applyWithArgs("foreign", BSSemActionParser, "asgnExpr");
            return this._applyWithArgs("foreign", BSJSTranslator, "trans", r);
        },
        curlyHostExpr: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            r = this._applyWithArgs("foreign", BSSemActionParser, "curlySemAction");
            return this._applyWithArgs("foreign", BSJSTranslator, "trans", r);
        },
        primHostExpr: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            r = this._applyWithArgs("foreign", BSSemActionParser, "semAction");
            return this._applyWithArgs("foreign", BSJSTranslator, "trans", r);
        },
        atomicHostExpr: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("curlyHostExpr");
            }, function() {
                return this._apply("primHostExpr");
            });
        },
        semAction: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            return this._or(function() {
                x = this._apply("curlyHostExpr");
                return [ "Act", x ];
            }, function() {
                this._applyWithArgs("token", "!");
                x = this._apply("atomicHostExpr");
                return [ "Act", x ];
            });
        },
        arrSemAction: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            this._applyWithArgs("token", "->");
            x = this._apply("atomicHostExpr");
            return [ "Act", x ];
        },
        semPred: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            this._applyWithArgs("token", "?");
            x = this._apply("atomicHostExpr");
            return [ "Pred", x ];
        },
        expr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, xs;
            return this._or(function() {
                x = this._applyWithArgs("expr5", true);
                xs = this._many1(function() {
                    this._applyWithArgs("token", "|");
                    return this._applyWithArgs("expr5", true);
                });
                return [ "Or", x ].concat(xs);
            }, function() {
                x = this._applyWithArgs("expr5", true);
                xs = this._many1(function() {
                    this._applyWithArgs("token", "||");
                    return this._applyWithArgs("expr5", true);
                });
                return [ "XOr", x ].concat(xs);
            }, function() {
                return this._applyWithArgs("expr5", false);
            });
        },
        expr5: function(ne) {
            var _fromIdx = this.input.idx, $elf = this, x, xs;
            return this._or(function() {
                x = this._apply("interleavePart");
                xs = this._many1(function() {
                    this._applyWithArgs("token", "&&");
                    return this._apply("interleavePart");
                });
                return [ "Interleave", x ].concat(xs);
            }, function() {
                return this._applyWithArgs("expr4", ne);
            });
        },
        interleavePart: function() {
            var _fromIdx = this.input.idx, $elf = this, part;
            return this._or(function() {
                this._applyWithArgs("token", "(");
                part = this._applyWithArgs("expr4", true);
                this._applyWithArgs("token", ")");
                return [ "1", part ];
            }, function() {
                part = this._applyWithArgs("expr4", true);
                return this._applyWithArgs("modedIPart", part);
            });
        },
        modedIPart: function() {
            var _fromIdx = this.input.idx, $elf = this, part;
            return this._or(function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "And");
                    return this._form(function() {
                        this._applyWithArgs("exactly", "Many");
                        return part = this._apply("anything");
                    });
                });
                return [ "*", part ];
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "And");
                    return this._form(function() {
                        this._applyWithArgs("exactly", "Many1");
                        return part = this._apply("anything");
                    });
                });
                return [ "+", part ];
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "And");
                    return this._form(function() {
                        this._applyWithArgs("exactly", "Opt");
                        return part = this._apply("anything");
                    });
                });
                return [ "?", part ];
            }, function() {
                part = this._apply("anything");
                return [ "1", part ];
            });
        },
        expr4: function(ne) {
            var _fromIdx = this.input.idx, $elf = this, act, xs;
            return this._or(function() {
                xs = this._many(function() {
                    return this._apply("expr3");
                });
                act = this._apply("arrSemAction");
                return [ "And" ].concat(xs).concat([ act ]);
            }, function() {
                this._pred(ne);
                xs = this._many1(function() {
                    return this._apply("expr3");
                });
                return [ "And" ].concat(xs);
            }, function() {
                this._pred(ne == false);
                xs = this._many(function() {
                    return this._apply("expr3");
                });
                return [ "And" ].concat(xs);
            });
        },
        optIter: function(x) {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case "?":
                        return [ "Opt", x ];
                      case "+":
                        return [ "Many1", x ];
                      case "*":
                        return [ "Many", x ];
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                this._apply("empty");
                return x;
            });
        },
        optBind: function(x) {
            var _fromIdx = this.input.idx, $elf = this, n;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case ":":
                        return function() {
                            n = this._apply("name");
                            return function() {
                                this["locals"][n] = true;
                                return [ "Set", n, x ];
                            }.call(this);
                        }.call(this);
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                this._apply("empty");
                return x;
            });
        },
        expr3: function() {
            var _fromIdx = this.input.idx, $elf = this, e, x, n;
            return this._or(function() {
                this._applyWithArgs("token", ":");
                n = this._apply("name");
                return function() {
                    this["locals"][n] = true;
                    return [ "Set", n, [ "App", "anything" ] ];
                }.call(this);
            }, function() {
                e = this._or(function() {
                    x = this._apply("expr2");
                    return this._applyWithArgs("optIter", x);
                }, function() {
                    return this._apply("semAction");
                });
                return this._applyWithArgs("optBind", e);
            }, function() {
                return this._apply("semPred");
            });
        },
        expr2: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            return this._or(function() {
                this._applyWithArgs("token", "~");
                x = this._apply("expr2");
                return [ "Not", x ];
            }, function() {
                this._applyWithArgs("token", "&");
                x = this._apply("expr1");
                return [ "Lookahead", x ];
            }, function() {
                return this._apply("expr1");
            });
        },
        expr1: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            return this._or(function() {
                return this._apply("application");
            }, function() {
                x = this._or(function() {
                    return this._applyWithArgs("keyword", "undefined");
                }, function() {
                    return this._applyWithArgs("keyword", "nil");
                }, function() {
                    return this._applyWithArgs("keyword", "true");
                }, function() {
                    return this._applyWithArgs("keyword", "false");
                });
                return [ "App", "exactly", x ];
            }, function() {
                this._apply("spaces");
                return this._or(function() {
                    return this._apply("seqString");
                }, function() {
                    return this._apply("tokenString");
                }, function() {
                    return this._apply("string");
                }, function() {
                    return this._apply("number");
                });
            }, function() {
                this._applyWithArgs("token", "[");
                x = this._apply("expr");
                this._applyWithArgs("token", "]");
                return [ "Form", x ];
            }, function() {
                this._applyWithArgs("token", "<");
                x = this._apply("expr");
                this._applyWithArgs("token", ">");
                return [ "ConsBy", x ];
            }, function() {
                this._applyWithArgs("token", "@<");
                x = this._apply("expr");
                this._applyWithArgs("token", ">");
                return [ "IdxConsBy", x ];
            }, function() {
                this._applyWithArgs("token", "(");
                x = this._apply("expr");
                this._applyWithArgs("token", ")");
                return x;
            });
        },
        param: function() {
            var _fromIdx = this.input.idx, $elf = this, n;
            this._applyWithArgs("token", ":");
            n = this._apply("name");
            return n;
        },
        ruleName: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._or(function() {
                return this._apply("name");
            }, function() {
                this._apply("spaces");
                return this._apply("tsString");
            });
        },
        rule: function() {
            var _fromIdx = this.input.idx, $elf = this, x, n, xs;
            this._lookahead(function() {
                return n = this._apply("ruleName");
            });
            this["locals"] = {
                "$elf=this": true,
                "_fromIdx=this.input.idx": true
            };
            this["params"] = [];
            x = this._applyWithArgs("rulePart", n);
            xs = this._many(function() {
                this._applyWithArgs("token", ",");
                return this._applyWithArgs("rulePart", n);
            });
            return [ "Rule", n, this["params"], Object.getOwnPropertyNames(this["locals"]), [ "Or", x ].concat(xs) ];
        },
        rulePart: function(rn) {
            var _fromIdx = this.input.idx, $elf = this, b, n, p;
            n = this._apply("ruleName");
            this._pred(n == rn);
            this._or(function() {
                p = this._many(function() {
                    return this._apply("param");
                });
                this._applyWithArgs("token", "=");
                this["params"] = this["params"].concat(p);
                return b = this._apply("expr");
            }, function() {
                return b = this._apply("expr");
            });
            return b;
        },
        grammar: function() {
            var _fromIdx = this.input.idx, $elf = this, rs, exported, sn, n;
            exported = this._or(function() {
                this._applyWithArgs("keyword", "export");
                return true;
            }, function() {
                return false;
            });
            this._applyWithArgs("keyword", "ometa");
            n = this._apply("name");
            sn = this._or(function() {
                this._applyWithArgs("token", "<:");
                return this._apply("name");
            }, function() {
                this._apply("empty");
                return "OMeta";
            });
            this._applyWithArgs("token", "{");
            rs = this._applyWithArgs("listOf", "rule", ",");
            this._applyWithArgs("token", "}");
            return [ "Grammar", exported, n, sn ].concat(rs);
        }
    });
    BSOMetaParser["_enableTokens"] = function() {
        OMeta["_enableTokens"].call(this, [ "keyword", "ruleName", "seqString", "tokenString", "string" ]);
    };
    var BSOMetaTranslator = exports.BSOMetaTranslator = OMeta._extend({
        App: function() {
            var _fromIdx = this.input.idx, rule, $elf = this, args;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case "super":
                        return function() {
                            args = this._many1(function() {
                                return this._apply("anything");
                            });
                            return [ this["sName"], "._superApplyWithArgs(this,", args.join(","), ")" ].join("");
                        }.call(this);
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                rule = this._apply("anything");
                args = this._many1(function() {
                    return this._apply("anything");
                });
                return [ 'this._applyWithArgs("', rule, '",', args.join(","), ")" ].join("");
            }, function() {
                rule = this._apply("anything");
                return [ 'this._apply("', rule, '")' ].join("");
            });
        },
        Act: function() {
            var _fromIdx = this.input.idx, $elf = this, expr;
            expr = this._apply("anything");
            return expr;
        },
        Pred: function() {
            var _fromIdx = this.input.idx, $elf = this, expr;
            expr = this._apply("anything");
            return [ "this._pred(", expr, ")" ].join("");
        },
        Or: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("transFn");
            });
            return [ "this._or(", xs.join(","), ")" ].join("");
        },
        XOr: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("transFn");
            });
            JSON.stringify(xs.unshift(this["name"] + "." + this["rName"]));
            return [ "this._xor(", xs.join(","), ")" ].join("");
        },
        Seq: function() {
            var _fromIdx = this.input.idx, $elf = this, xs, y;
            return this._or(function() {
                xs = this._many(function() {
                    return this._applyWithArgs("notLast", "trans");
                });
                y = this._apply("trans");
                xs.push("return " + y);
                return xs.join(";");
            }, function() {
                return "undefined";
            });
        },
        And: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._apply("Seq");
            return [ "(function(){", xs, "}).call(this)" ].join("");
        },
        Opt: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._opt(", x, ")" ].join("");
        },
        Many: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._many(", x, ")" ].join("");
        },
        Many1: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._many1(", x, ")" ].join("");
        },
        Set: function() {
            var _fromIdx = this.input.idx, $elf = this, v, n;
            n = this._apply("anything");
            v = this._apply("trans");
            return [ n, "=", v ].join("");
        },
        Not: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._not(", x, ")" ].join("");
        },
        Lookahead: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._lookahead(", x, ")" ].join("");
        },
        Form: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._form(", x, ")" ].join("");
        },
        ConsBy: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._consumedBy(", x, ")" ].join("");
        },
        IdxConsBy: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("transFn");
            return [ "this._idxConsumedBy(", x, ")" ].join("");
        },
        JumpTable: function() {
            var _fromIdx = this.input.idx, $elf = this, cases;
            cases = this._many(function() {
                return this._apply("jtCase");
            });
            return this.jumpTableCode(cases);
        },
        Interleave: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("intPart");
            });
            return [ "this._interleave(", xs.join(","), ")" ].join("");
        },
        Rule: function() {
            var _fromIdx = this.input.idx, $elf = this, ps, name, body, ls;
            name = this._apply("anything");
            this["rName"] = name;
            ps = this._apply("params");
            ls = this._apply("locals");
            this._or(function() {
                return this._form(function() {
                    this._applyWithArgs("exactly", "And");
                    return body = this._apply("Seq");
                });
            }, function() {
                body = this._apply("trans");
                return body = [ "return ", body ].join("");
            });
            return [ '\n"', name, '":function(', ps, "){", ls, body, "}" ].join("");
        },
        Grammar: function() {
            var _fromIdx = this.input.idx, sName, rules, $elf = this, exported, name;
            exported = this._apply("anything");
            name = this._apply("anything");
            sName = this._apply("anything");
            this["name"] = name;
            this["sName"] = sName;
            rules = this._many(function() {
                return this._apply("trans");
            });
            return [ "var ", name, exported ? "=exports." + name : "", "=", sName, "._extend({", rules.join(","), "})" ].join("");
        },
        intPart: function() {
            var _fromIdx = this.input.idx, $elf = this, mode, part;
            this._form(function() {
                mode = this._apply("anything");
                return part = this._apply("transFn");
            });
            return JSON.stringify(mode) + "," + part;
        },
        jtCase: function() {
            var _fromIdx = this.input.idx, $elf = this, e, x;
            this._form(function() {
                x = this._apply("anything");
                return e = this._apply("trans");
            });
            return [ JSON.stringify(x), e ];
        },
        locals: function() {
            var _fromIdx = this.input.idx, $elf = this, vs;
            return this._or(function() {
                this._form(function() {
                    return vs = this._many1(function() {
                        return this._apply("string");
                    });
                });
                return [ "var ", vs.join(","), ";" ].join("");
            }, function() {
                this._form(function() {
                    undefined;
                });
                return "";
            });
        },
        params: function() {
            var _fromIdx = this.input.idx, $elf = this, vs;
            return this._or(function() {
                this._form(function() {
                    return vs = this._many1(function() {
                        return this._apply("string");
                    });
                });
                return vs.join(",");
            }, function() {
                this._form(function() {
                    undefined;
                });
                return "";
            });
        },
        trans: function() {
            var _fromIdx = this.input.idx, $elf = this, t, ans;
            this._form(function() {
                t = this._apply("anything");
                return ans = this._applyWithArgs("apply", t);
            });
            return ans;
        },
        transFn: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            this._or(function() {
                return this._form(function() {
                    this._applyWithArgs("exactly", "And");
                    return x = this._apply("Seq");
                });
            }, function() {
                x = this._apply("trans");
                return x = [ "return ", x ].join("");
            });
            return [ "(function(){", x, "})" ].join("");
        }
    });
    BSOMetaTranslator["jumpTableCode"] = function(cases) {
        var buf = [];
        buf.push("(function(){switch(this._apply('anything')){");
        for (var i = 0; i < cases["length"]; ++i) {
            buf.push("case " + cases[i][0] + ":return " + cases[i][1] + ";");
        }
        buf.push("default: throw this._fail()}}).call(this)");
        return buf.join("");
    };
    var BSOMetaJSParser = exports.BSOMetaJSParser = BSJSParser._extend({
        srcElem: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            return this._or(function() {
                this._apply("spaces");
                r = this._applyWithArgs("foreign", BSOMetaParser, "grammar");
                this._apply("sc");
                return r;
            }, function() {
                return BSJSParser._superApplyWithArgs(this, "srcElem");
            });
        },
        Process: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._apply("topLevel");
        }
    });
    var BSOMetaJSTranslator = exports.BSOMetaJSTranslator = BSJSTranslator._extend({
        Grammar: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            r = this._many(function() {
                return this._apply("anything");
            });
            r = this._applyWithArgs("foreign", BSOMetaOptimizer, "optimizeGrammar", [ "Grammar" ].concat(r));
            return this._applyWithArgs("foreign", BSOMetaTranslator, "trans", r);
        }
    });
    var BSNullOptimization = exports.BSNullOptimization = OMeta._extend({
        setHelped: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this["_didSomething"] = true;
        },
        helped: function() {
            var _fromIdx = this.input.idx, $elf = this;
            return this._pred(this["_didSomething"]);
        },
        trans: function() {
            var _fromIdx = this.input.idx, $elf = this, t, ans;
            this._form(function() {
                t = this._apply("anything");
                this._pred(this[t] != undefined);
                return ans = this._applyWithArgs("apply", t);
            });
            return ans;
        },
        optimize: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            this._apply("helped");
            return x;
        },
        App: function() {
            var _fromIdx = this.input.idx, rule, $elf = this, args;
            rule = this._apply("anything");
            args = this._many(function() {
                return this._apply("anything");
            });
            return [ "App", rule ].concat(args);
        },
        Act: function() {
            var _fromIdx = this.input.idx, $elf = this, expr;
            expr = this._apply("anything");
            return [ "Act", expr ];
        },
        Pred: function() {
            var _fromIdx = this.input.idx, $elf = this, expr;
            expr = this._apply("anything");
            return [ "Pred", expr ];
        },
        Or: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("trans");
            });
            return [ "Or" ].concat(xs);
        },
        XOr: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("trans");
            });
            return [ "XOr" ].concat(xs);
        },
        And: function() {
            var _fromIdx = this.input.idx, $elf = this, xs;
            xs = this._many(function() {
                return this._apply("trans");
            });
            return [ "And" ].concat(xs);
        },
        Opt: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "Opt", x ];
        },
        Many: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "Many", x ];
        },
        Many1: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "Many1", x ];
        },
        Set: function() {
            var _fromIdx = this.input.idx, $elf = this, v, n;
            n = this._apply("anything");
            v = this._apply("trans");
            return [ "Set", n, v ];
        },
        Not: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "Not", x ];
        },
        Lookahead: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "Lookahead", x ];
        },
        Form: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "Form", x ];
        },
        ConsBy: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "ConsBy", x ];
        },
        IdxConsBy: function() {
            var _fromIdx = this.input.idx, $elf = this, x;
            x = this._apply("trans");
            return [ "IdxConsBy", x ];
        },
        JumpTable: function() {
            var _fromIdx = this.input.idx, $elf = this, e, ces, c;
            ces = this._many(function() {
                this._form(function() {
                    c = this._apply("anything");
                    return e = this._apply("trans");
                });
                return [ c, e ];
            });
            return [ "JumpTable" ].concat(ces);
        },
        Interleave: function() {
            var _fromIdx = this.input.idx, $elf = this, m, p, xs;
            xs = this._many(function() {
                this._form(function() {
                    m = this._apply("anything");
                    return p = this._apply("trans");
                });
                return [ m, p ];
            });
            return [ "Interleave" ].concat(xs);
        },
        Rule: function() {
            var _fromIdx = this.input.idx, $elf = this, ps, name, body, ls;
            name = this._apply("anything");
            ps = this._apply("anything");
            ls = this._apply("anything");
            body = this._apply("trans");
            return [ "Rule", name, ps, ls, body ];
        }
    });
    BSNullOptimization["initialize"] = function() {
        this["_didSomething"] = false;
    };
    var BSAssociativeOptimization = exports.BSAssociativeOptimization = BSNullOptimization._extend({
        And: function() {
            var _fromIdx = this.input.idx, $elf = this, x, xs;
            return this._or(function() {
                x = this._apply("trans");
                this._apply("end");
                this._apply("setHelped");
                return x;
            }, function() {
                xs = this._applyWithArgs("transInside", "And");
                return [ "And" ].concat(xs);
            });
        },
        Or: function() {
            var _fromIdx = this.input.idx, $elf = this, x, xs;
            return this._or(function() {
                x = this._apply("trans");
                this._apply("end");
                this._apply("setHelped");
                return x;
            }, function() {
                xs = this._applyWithArgs("transInside", "Or");
                return [ "Or" ].concat(xs);
            });
        },
        XOr: function() {
            var _fromIdx = this.input.idx, $elf = this, x, xs;
            return this._or(function() {
                x = this._apply("trans");
                this._apply("end");
                this._apply("setHelped");
                return x;
            }, function() {
                xs = this._applyWithArgs("transInside", "XOr");
                return [ "XOr" ].concat(xs);
            });
        },
        transInside: function(t) {
            var _fromIdx = this.input.idx, $elf = this, ys, x, xs;
            return this._or(function() {
                this._form(function() {
                    this._applyWithArgs("exactly", t);
                    return xs = this._applyWithArgs("transInside", t);
                });
                ys = this._applyWithArgs("transInside", t);
                this._apply("setHelped");
                return xs.concat(ys);
            }, function() {
                x = this._apply("trans");
                xs = this._applyWithArgs("transInside", t);
                return [ x ].concat(xs);
            }, function() {
                return [];
            });
        }
    });
    var BSPushDownSet = exports.BSPushDownSet = BSNullOptimization._extend({
        Set: function() {
            var _fromIdx = this.input.idx, $elf = this, v, n, xs, y;
            return this._or(function() {
                n = this._apply("anything");
                this._form(function() {
                    this._applyWithArgs("exactly", "And");
                    xs = this._many(function() {
                        return this._applyWithArgs("notLast", "trans");
                    });
                    return y = this._apply("trans");
                });
                this._apply("setHelped");
                return [ "And" ].concat(xs).concat([ [ "Set", n, y ] ]);
            }, function() {
                n = this._apply("anything");
                v = this._apply("trans");
                return [ "Set", n, v ];
            });
        }
    });
    var BSSeqInliner = exports.BSSeqInliner = BSNullOptimization._extend({
        App: function() {
            var _fromIdx = this.input.idx, rule, $elf = this, cs, s, args;
            return this._or(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case "seq":
                        return function() {
                            s = this._apply("anything");
                            this._apply("end");
                            cs = this._applyWithArgs("seqString", s);
                            this._apply("setHelped");
                            return [ "And" ].concat(cs).concat([ [ "Act", s ] ]);
                        }.call(this);
                      default:
                        throw this._fail();
                    }
                }.call(this);
            }, function() {
                rule = this._apply("anything");
                args = this._many(function() {
                    return this._apply("anything");
                });
                return [ "App", rule ].concat(args);
            });
        },
        inlineChar: function() {
            var _fromIdx = this.input.idx, $elf = this, c;
            c = this._applyWithArgs("foreign", BSOMetaParser, "eChar");
            this._not(function() {
                return this._apply("end");
            });
            return [ "App", "exactly", JSON.stringify(c) ];
        },
        seqString: function() {
            var _fromIdx = this.input.idx, $elf = this, cs, s;
            this._lookahead(function() {
                s = this._apply("anything");
                return this._pred(typeof s === "string");
            });
            return this._or(function() {
                this._form(function() {
                    this._applyWithArgs("exactly", '"');
                    cs = this._many(function() {
                        return this._apply("inlineChar");
                    });
                    return this._applyWithArgs("exactly", '"');
                });
                return cs;
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "'");
                    cs = this._many(function() {
                        return this._apply("inlineChar");
                    });
                    return this._applyWithArgs("exactly", "'");
                });
                return cs;
            });
        }
    });
    JumpTable = function(choiceOp, choice) {
        this["choiceOp"] = choiceOp;
        this["choices"] = {};
        this.add(choice);
    };
    JumpTable["prototype"]["add"] = function(choice) {
        var c = choice[0], t = choice[1];
        if (this["choices"][c]) {
            if (this["choices"][c][0] == this["choiceOp"]) {
                this["choices"][c].push(t);
            } else {
                this["choices"][c] = [ this["choiceOp"], this["choices"][c], t ];
            }
        } else {
            this["choices"][c] = t;
        }
    };
    JumpTable["prototype"]["toTree"] = function() {
        var r = [ "JumpTable" ], choiceKeys = Object.getOwnPropertyNames(this["choices"]);
        for (var i = 0; i < choiceKeys["length"]; i += 1) {
            r.push([ choiceKeys[i], this["choices"][choiceKeys[i]] ]);
        }
        return r;
    };
    var BSJumpTableOptimization = exports.BSJumpTableOptimization = BSNullOptimization._extend({
        Or: function() {
            var _fromIdx = this.input.idx, $elf = this, cs;
            cs = this._many(function() {
                return this._or(function() {
                    return this._applyWithArgs("jtChoices", "Or");
                }, function() {
                    return this._apply("trans");
                });
            });
            return [ "Or" ].concat(cs);
        },
        XOr: function() {
            var _fromIdx = this.input.idx, $elf = this, cs;
            cs = this._many(function() {
                return this._or(function() {
                    return this._applyWithArgs("jtChoices", "XOr");
                }, function() {
                    return this._apply("trans");
                });
            });
            return [ "XOr" ].concat(cs);
        },
        quotedString: function() {
            var _fromIdx = this.input.idx, $elf = this, cs, c;
            this._lookahead(function() {
                return this._apply("string");
            });
            this._form(function() {
                return function() {
                    switch (this._apply("anything")) {
                      case '"':
                        return function() {
                            cs = this._many(function() {
                                c = this._applyWithArgs("foreign", BSOMetaParser, "eChar");
                                this._not(function() {
                                    return this._apply("end");
                                });
                                return c;
                            });
                            return this._applyWithArgs("exactly", '"');
                        }.call(this);
                      case "'":
                        return function() {
                            cs = this._many(function() {
                                c = this._applyWithArgs("foreign", BSOMetaParser, "eChar");
                                this._not(function() {
                                    return this._apply("end");
                                });
                                return c;
                            });
                            return this._applyWithArgs("exactly", "'");
                        }.call(this);
                      default:
                        throw this._fail();
                    }
                }.call(this);
            });
            return cs.join("");
        },
        jtChoice: function() {
            var _fromIdx = this.input.idx, $elf = this, x, rest;
            return this._or(function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "And");
                    this._form(function() {
                        this._applyWithArgs("exactly", "App");
                        this._applyWithArgs("exactly", "exactly");
                        return x = this._apply("quotedString");
                    });
                    return rest = this._many(function() {
                        return this._apply("anything");
                    });
                });
                return [ x, [ "And" ].concat(rest) ];
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "App");
                    this._applyWithArgs("exactly", "exactly");
                    return x = this._apply("quotedString");
                });
                return [ x, [ "Act", JSON.stringify(x) ] ];
            });
        },
        jtChoices: function(op) {
            var _fromIdx = this.input.idx, $elf = this, jt, c;
            c = this._apply("jtChoice");
            jt = new JumpTable(op, c);
            this._many(function() {
                c = this._apply("jtChoice");
                return jt.add(c);
            });
            this._apply("setHelped");
            return jt.toTree();
        }
    });
    var BSOMetaOptimizer = exports.BSOMetaOptimizer = OMeta._extend({
        optimizeGrammar: function() {
            var _fromIdx = this.input.idx, $elf = this, rs, exported, sn, n;
            this._form(function() {
                this._applyWithArgs("exactly", "Grammar");
                exported = this._apply("anything");
                n = this._apply("anything");
                sn = this._apply("anything");
                return rs = this._many(function() {
                    return this._apply("optimizeRule");
                });
            });
            return [ "Grammar", exported, n, sn ].concat(rs);
        },
        optimizeRule: function() {
            var _fromIdx = this.input.idx, r, $elf = this;
            r = this._apply("anything");
            this._or(function() {
                return r = this._applyWithArgs("foreign", BSSeqInliner, "optimize", r);
            }, function() {
                return this._apply("empty");
            });
            this._many(function() {
                return this._or(function() {
                    return r = this._applyWithArgs("foreign", BSAssociativeOptimization, "optimize", r);
                }, function() {
                    return r = this._applyWithArgs("foreign", BSJumpTableOptimization, "optimize", r);
                }, function() {
                    return r = this._applyWithArgs("foreign", BSPushDownSet, "optimize", r);
                });
            });
            return r;
        }
    });
};

define('ometa-compiler',[],function () {
	return exports;
});

define('ometa',{load: function(id){throw new Error("Dynamic load not allowed: " + id);}});
define('ometa!sbvr-parser/SBVRLibs',["underscore","ometa-core"],(function (_){var primitives = ({"Serial": true,"Integer": true,"Short Text": true,"Long Text": true,"Real": true,"Date": true,"Date Time": true,"Time": true,"Interval": true,"Hashed": true,"JSON": true});var SBVRLibs=OMeta._extend({});(SBVRLibs["initialize"]=(function (){(this["factTypes"]=({}));(this["conceptTypes"]=({}))}));(SBVRLibs["ApplyFirstExisting"]=(function (rules,ruleArgs){if((ruleArgs == null)){(ruleArgs=[])}else{undefined};ruleArgs.unshift("");for(var i = (0);(i < rules["length"]);i++){if((this[rules[i]] != undefined)){if(((ruleArgs != null) && (ruleArgs["length"] > (0)))){(ruleArgs[(0)]=rules[i]);return this["_applyWithArgs"].apply(this,ruleArgs)}else{undefined};return this._apply(rules[i],ruleArgs)}else{undefined}}}));(SBVRLibs["IsPrimitive"]=(function (termName){if(primitives.hasOwnProperty(termName)){return termName}else{undefined};if((this["conceptTypes"].hasOwnProperty(termName) && (termName=this["conceptTypes"][termName]))){if(primitives.hasOwnProperty(termName)){return termName}else{undefined}}else{undefined};return false}));(SBVRLibs["AddFactType"]=(function (factType,realFactType){(realFactType=_.extend([],realFactType));this._traverseFactType(factType,realFactType);if(((factType["length"] == (3)) && (factType[(1)][(1)] == "has"))){this._traverseFactType([factType[(2)],["Verb","is of"],factType[(0)]],realFactType)}else{if(((factType["length"] == (3)) && (factType[(1)][(1)] == "is of"))){this._traverseFactType([factType[(2)],["Verb","has"],factType[(0)]],realFactType)}else{undefined}}}));(SBVRLibs["_traverseFactType"]=(function (factType,create){var $elf = this,traverseRecurse = (function (currentFactTypePart,remainingFactType,currentLevel){if((currentFactTypePart == null)){if(create){(currentLevel["__valid"]=create)}else{undefined};return currentLevel}else{undefined};var finalLevel,finalLevels = ({});if((currentLevel.hasOwnProperty(currentFactTypePart) || (create && (currentLevel[currentFactTypePart]=({}))))){(finalLevel=traverseRecurse(remainingFactType[(0)],remainingFactType.slice((1)),currentLevel[currentFactTypePart]));if((finalLevel != false)){_.extend(finalLevels,finalLevel)}else{undefined}}else{undefined};if(((! create) && ((currentFactTypePart[(0)] == "Term") || (currentFactTypePart[(0)] == "Name")))){while($elf["conceptTypes"].hasOwnProperty(currentFactTypePart[(1)])){(currentFactTypePart=["Term",$elf["conceptTypes"][currentFactTypePart[(1)]]]);if(currentLevel.hasOwnProperty(currentFactTypePart)){(finalLevel=traverseRecurse(remainingFactType[(0)],remainingFactType.slice((1)),currentLevel[currentFactTypePart]));if((finalLevel !== false)){_.extend(finalLevels,finalLevel)}else{undefined}}else{undefined}}}else{undefined};return ((_.isEmpty(finalLevels) === true)?false:finalLevels)});return traverseRecurse(factType[(0)],factType.slice((1)),this["factTypes"])}));(SBVRLibs["ActualFactType"]=(function (factType){var traverseInfo = this._traverseFactType(factType);if(((traverseInfo === false) || (! traverseInfo.hasOwnProperty("__valid")))){return false}else{undefined};return traverseInfo["__valid"]}));(SBVRLibs["IsChild"]=(function (child,parent){(parent=parent[(1)]);do{if((child == parent)){return true}else{undefined}}while((this["conceptTypes"].hasOwnProperty(child) && (child=this["conceptTypes"][child])));return false}));(SBVRLibs["FactTypeRootTerm"]=(function (term,actualFactType){for(var i = (0);(i < actualFactType["length"]);i++){if(this.IsChild(term,actualFactType[i])){return actualFactType[i][(1)]}else{undefined}};return false}));(SBVRLibs["FactTypeRootTerms"]=(function (factType,actualFactType){var rootTerms = [],rootTermIndex = (0);for(var i = (0);(i < actualFactType["length"]);(i+=(2))){(rootTerms[rootTermIndex++]=this.FactTypeRootTerm(factType[i][(1)],actualFactType))};return rootTerms}));(SBVRLibs["GetResourceName"]=(function (termOrFactType){var i = (0),resource = [];if(_.isString(termOrFactType)){return termOrFactType.replace(new RegExp(" ","g"),"_")}else{for(undefined;(i < termOrFactType["length"]);i++){resource.push(termOrFactType[i][(1)].replace(new RegExp(" ","g"),"_"))};return resource.join("-")}}));(SBVRLibs["GetTableField"]=(function (table,fieldName){var fieldID = this.GetTableFieldID(table,fieldName);if((fieldID === false)){return false}else{undefined};return table["fields"][fieldID]}));(SBVRLibs["GetTableFieldID"]=(function (table,fieldName){var tableFields = table["fields"];for(var i = (0);(i < tableFields["length"]);i++){if((tableFields[i][(1)] == fieldName)){return i}else{undefined}};return false}));return SBVRLibs}));
/*
Copyright (c) 2010 Ryan Schuft (ryan.schuft@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*
  This code is based in part on the work done in Ruby to support
  infection as part of Ruby on Rails in the ActiveSupport's Inflector
  and Inflections classes.  It was initally ported to Javascript by
  Ryan Schuft (ryan.schuft@gmail.com) in 2007.

  The code is available at http://code.google.com/p/inflection-js/

  The basic usage is:
    1. Include this script on your web page.
    2. Call functions on any String object in Javascript

  Currently implemented functions:

    String.pluralize(plural) == String
      renders a singular English language noun into its plural form
      normal results can be overridden by passing in an alternative

    String.singularize(singular) == String
      renders a plural English language noun into its singular form
      normal results can be overridden by passing in an alterative

    String.camelize(lowFirstLetter) == String
      renders a lower case underscored word into camel case
      the first letter of the result will be upper case unless you pass true
      also translates "/" into "::" (underscore does the opposite)

    String.underscore() == String
      renders a camel cased word into words seperated by underscores
      also translates "::" back into "/" (camelize does the opposite)

    String.humanize(lowFirstLetter) == String
      renders a lower case and underscored word into human readable form
      defaults to making the first letter capitalized unless you pass true

    String.capitalize() == String
      renders all characters to lower case and then makes the first upper

    String.dasherize() == String
      renders all underbars and spaces as dashes

    String.titleize() == String
      renders words into title casing (as for book titles)

    String.demodulize() == String
      renders class names that are prepended by modules into just the class

    String.tableize() == String
      renders camel cased singular words into their underscored plural form

    String.classify() == String
      renders an underscored plural word into its camel cased singular form

    String.foreign_key(dropIdUbar) == String
      renders a class name (camel cased singular noun) into a foreign key
      defaults to seperating the class from the id with an underbar unless
      you pass true

    String.ordinalize() == String
      renders all numbers found in the string into their sequence like "22nd"
*/

/*
  This sets up a container for some constants in its own namespace
  We use the window (if available) to enable dynamic loading of this script
  Window won't necessarily exist for non-browsers.
*/
if (typeof window !== "undefined" && !window.InflectionJS)
{
    window.InflectionJS = null;
}

/*
  This sets up some constants for later use
  This should use the window namespace variable if available
*/
InflectionJS =
{
    /*
      This is a list of nouns that use the same form for both singular and plural.
      This list should remain entirely in lower case to correctly match Strings.
    */
    uncountable_words: [
        'equipment', 'information', 'rice', 'money', 'species', 'series',
        'fish', 'sheep', 'moose', 'deer', 'news'
    ],

    /*
      These rules translate from the singular form of a noun to its plural form.
    */
    plural_rules: [
        [new RegExp('(m)an$', 'gi'),                 '$1en'],
        [new RegExp('(pe)rson$', 'gi'),              '$1ople'],
        [new RegExp('(child)$', 'gi'),               '$1ren'],
        [new RegExp('^(ox)$', 'gi'),                 '$1en'],
        [new RegExp('(ax|test)is$', 'gi'),           '$1es'],
        [new RegExp('(octop|vir)us$', 'gi'),         '$1i'],
        [new RegExp('(alias|status)$', 'gi'),        '$1es'],
        [new RegExp('(bu)s$', 'gi'),                 '$1ses'],
        [new RegExp('(buffal|tomat|potat)o$', 'gi'), '$1oes'],
        [new RegExp('([ti])um$', 'gi'),              '$1a'],
        [new RegExp('sis$', 'gi'),                   'ses'],
        [new RegExp('(?:([^f])fe|([lr])f)$', 'gi'),  '$1$2ves'],
        [new RegExp('(hive)$', 'gi'),                '$1s'],
        [new RegExp('([^aeiouy]|qu)y$', 'gi'),       '$1ies'],
        [new RegExp('(x|ch|ss|sh)$', 'gi'),          '$1es'],
        [new RegExp('(matr|vert|ind)ix|ex$', 'gi'),  '$1ices'],
        [new RegExp('([m|l])ouse$', 'gi'),           '$1ice'],
        [new RegExp('(quiz)$', 'gi'),                '$1zes'],
        [new RegExp('s$', 'gi'),                     's'],
        [new RegExp('$', 'gi'),                      's']
    ],

    /*
      These rules translate from the plural form of a noun to its singular form.
    */
    singular_rules: [
        [new RegExp('(m)en$', 'gi'),                                                       '$1an'],
        [new RegExp('(pe)ople$', 'gi'),                                                    '$1rson'],
        [new RegExp('(child)ren$', 'gi'),                                                  '$1'],
        [new RegExp('([ti])a$', 'gi'),                                                     '$1um'],
        [new RegExp('((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$','gi'), '$1$2sis'],
        [new RegExp('(hive)s$', 'gi'),                                                     '$1'],
        [new RegExp('(tive)s$', 'gi'),                                                     '$1'],
        [new RegExp('(curve)s$', 'gi'),                                                    '$1'],
        [new RegExp('([lr])ves$', 'gi'),                                                   '$1f'],
        [new RegExp('([^fo])ves$', 'gi'),                                                  '$1fe'],
        [new RegExp('([^aeiouy]|qu)ies$', 'gi'),                                           '$1y'],
        [new RegExp('(s)eries$', 'gi'),                                                    '$1eries'],
        [new RegExp('(m)ovies$', 'gi'),                                                    '$1ovie'],
        [new RegExp('(x|ch|ss|sh)es$', 'gi'),                                              '$1'],
        [new RegExp('([m|l])ice$', 'gi'),                                                  '$1ouse'],
        [new RegExp('(bus)es$', 'gi'),                                                     '$1'],
        [new RegExp('(o)es$', 'gi'),                                                       '$1'],
        [new RegExp('(shoe)s$', 'gi'),                                                     '$1'],
        [new RegExp('(cris|ax|test)es$', 'gi'),                                            '$1is'],
        [new RegExp('(octop|vir)i$', 'gi'),                                                '$1us'],
        [new RegExp('(alias|status)es$', 'gi'),                                            '$1'],
        [new RegExp('^(ox)en', 'gi'),                                                      '$1'],
        [new RegExp('(vert|ind)ices$', 'gi'),                                              '$1ex'],
        [new RegExp('(matr)ices$', 'gi'),                                                  '$1ix'],
        [new RegExp('(quiz)zes$', 'gi'),                                                   '$1'],
        [new RegExp('s$', 'gi'),                                                           '']
    ],

    /*
      This is a list of words that should not be capitalized for title case
    */
    non_titlecased_words: [
        'and', 'or', 'nor', 'a', 'an', 'the', 'so', 'but', 'to', 'of', 'at',
        'by', 'from', 'into', 'on', 'onto', 'off', 'out', 'in', 'over',
        'with', 'for'
    ],

    /*
      These are regular expressions used for converting between String formats
    */
    id_suffix: new RegExp('(_ids|_id)$', 'g'),
    underbar: new RegExp('_', 'g'),
    space_or_underbar: new RegExp('[ _]', 'g'),
    uppercase: new RegExp('([A-Z])', 'g'),
    underbar_prefix: new RegExp('^_'),
    
    /*
      This is a helper method that applies rules based replacement to a String
      Signature:
        InflectionJS.apply_rules(str, rules, skip, override) == String
      Arguments:
        str - String - String to modify and return based on the passed rules
        rules - Array: [RegExp, String] - Regexp to match paired with String to use for replacement
        skip - Array: [String] - Strings to skip if they match
      Returns:
        String - passed String modified by passed rules
      Examples:
        InflectionJS.apply_rules("cows", InflectionJs.singular_rules) === 'cow'
    */
    apply_rules: function(str, rules, skip) {
        if (skip.indexOf(str.toLowerCase()) === -1) {
            for (var x = 0, l = rules.length; x < l; x++) {
                if (rules[x][0].test(str)) {
                    return str.replace(rules[x][0], rules[x][1]);
                }
            }
        }
        return str;
    }
};

/*
  This lets us detect if an Array contains a given element
  Signature:
    Array.indexOf(item, fromIndex, compareFunc) == Integer
  Arguments:
    item - Object - object to locate in the Array
    fromIndex - Integer (optional) - starts checking from this position in the Array
    compareFunc - Function (optional) - function used to compare Array item vs passed item
  Returns:
    Integer - index position in the Array of the passed item
  Examples:
    ['hi','there'].indexOf("guys") === -1
    ['hi','there'].indexOf("hi") === 0
*/
if (!Array.prototype.indexOf)
{
    Array.prototype.indexOf = function(item, fromIndex, compareFunc)
    {
        if (!fromIndex)
        {
            fromIndex = -1;
        }
        var index = -1;
        for (var i = fromIndex; i < this.length; i++)
        {
            if (this[i] === item || compareFunc && compareFunc(this[i], item))
            {
                index = i;
                break;
            }
        }
        return index;
    };
}

/*
  You can override this list for all Strings or just one depending on if you
  set the new values on prototype or on a given String instance.
*/
if (!String.prototype._uncountable_words)
{
    String.prototype._uncountable_words = InflectionJS.uncountable_words;
}

/*
  You can override this list for all Strings or just one depending on if you
  set the new values on prototype or on a given String instance.
*/
if (!String.prototype._plural_rules)
{
    String.prototype._plural_rules = InflectionJS.plural_rules;
}

/*
  You can override this list for all Strings or just one depending on if you
  set the new values on prototype or on a given String instance.
*/
if (!String.prototype._singular_rules)
{
    String.prototype._singular_rules = InflectionJS.singular_rules;
}

/*
  You can override this list for all Strings or just one depending on if you
  set the new values on prototype or on a given String instance.
*/
if (!String.prototype._non_titlecased_words)
{
    String.prototype._non_titlecased_words = InflectionJS.non_titlecased_words;
}

/*
  This function adds plurilization support to every String object
    Signature:
      String.pluralize(plural) == String
    Arguments:
      plural - String (optional) - overrides normal output with said String
    Returns:
      String - singular English language nouns are returned in plural form
    Examples:
      "person".pluralize() == "people"
      "octopus".pluralize() == "octopi"
      "Hat".pluralize() == "Hats"
      "person".pluralize("guys") == "guys"
*/
if (!String.prototype.pluralize) {
    (function() {
        var memo = {};
        String.prototype.pluralize = function(plural) {
            if(plural) {
                return plural;
            }
            var thisString = this.toString();
            if(!memo.hasOwnProperty(thisString)) {
                memo[thisString] = InflectionJS.apply_rules(
                    this.toString(),
                    this._plural_rules,
                    this._uncountable_words
                );
            }
            return memo[thisString];
        };
    })();
}

/*
  This function adds singularization support to every String object
    Signature:
      String.singularize(singular) == String
    Arguments:
      singular - String (optional) - overrides normal output with said String
    Returns:
      String - plural English language nouns are returned in singular form
    Examples:
      "people".singularize() == "person"
      "octopi".singularize() == "octopus"
      "Hats".singularize() == "Hat"
      "guys".singularize("person") == "person"
*/
if (!String.prototype.singularize) {
    (function() {
        var memo = {};
        String.prototype.singularize = function(singular) {
            if(singular) {
                return singular;
            }
            var thisString = this.toString();
            if(!memo.hasOwnProperty(thisString)) {
                memo[thisString] = InflectionJS.apply_rules(
                    thisString,
                    this._singular_rules,
                    this._uncountable_words
                );
            }
            return memo[thisString];
        };
    })();
}

/*
  This function adds camelization support to every String object
    Signature:
      String.camelize(lowFirstLetter) == String
    Arguments:
      lowFirstLetter - boolean (optional) - default is to capitalize the first
        letter of the results... passing true will lowercase it
    Returns:
      String - lower case underscored words will be returned in camel case
        additionally '/' is translated to '::'
    Examples:
      "message_properties".camelize() == "MessageProperties"
      "message_properties".camelize(true) == "messageProperties"
*/
if (!String.prototype.camelize)
{
     String.prototype.camelize = function(lowFirstLetter)
     {
        var str = this.toLowerCase();
        var str_path = str.split('/');
        for (var i = 0; i < str_path.length; i++)
        {
            var str_arr = str_path[i].split('_');
            var initX = ((lowFirstLetter && i + 1 === str_path.length) ? (1) : (0));
            for (var x = initX; x < str_arr.length; x++)
            {
                str_arr[x] = str_arr[x].charAt(0).toUpperCase() + str_arr[x].substring(1);
            }
            str_path[i] = str_arr.join('');
        }
        str = str_path.join('::');
        return str;
    };
}

/*
  This function adds underscore support to every String object
    Signature:
      String.underscore() == String
    Arguments:
      N/A
    Returns:
      String - camel cased words are returned as lower cased and underscored
        additionally '::' is translated to '/'
    Examples:
      "MessageProperties".camelize() == "message_properties"
      "messageProperties".underscore() == "message_properties"
*/
if (!String.prototype.underscore)
{
     String.prototype.underscore = function()
     {
        var str = this;
        var str_path = str.split('::');
        for (var i = 0; i < str_path.length; i++)
        {
            str_path[i] = str_path[i].replace(InflectionJS.uppercase, '_$1');
            str_path[i] = str_path[i].replace(InflectionJS.underbar_prefix, '');
        }
        str = str_path.join('/').toLowerCase();
        return str;
    };
}

/*
  This function adds humanize support to every String object
    Signature:
      String.humanize(lowFirstLetter) == String
    Arguments:
      lowFirstLetter - boolean (optional) - default is to capitalize the first
        letter of the results... passing true will lowercase it
    Returns:
      String - lower case underscored words will be returned in humanized form
    Examples:
      "message_properties".humanize() == "Message properties"
      "message_properties".humanize(true) == "message properties"
*/
if (!String.prototype.humanize)
{
    String.prototype.humanize = function(lowFirstLetter)
    {
        var str = this.toLowerCase();
        str = str.replace(InflectionJS.id_suffix, '');
        str = str.replace(InflectionJS.underbar, ' ');
        if (!lowFirstLetter)
        {
            str = str.capitalize();
        }
        return str;
    };
}

/*
  This function adds capitalization support to every String object
    Signature:
      String.capitalize() == String
    Arguments:
      N/A
    Returns:
      String - all characters will be lower case and the first will be upper
    Examples:
      "message_properties".capitalize() == "Message_properties"
      "message properties".capitalize() == "Message properties"
*/
if (!String.prototype.capitalize)
{
    String.prototype.capitalize = function()
    {
        var str = this.toLowerCase();
        str = str.substring(0, 1).toUpperCase() + str.substring(1);
        return str;
    };
}

/*
  This function adds dasherization support to every String object
    Signature:
      String.dasherize() == String
    Arguments:
      N/A
    Returns:
      String - replaces all spaces or underbars with dashes
    Examples:
      "message_properties".capitalize() == "message-properties"
      "Message Properties".capitalize() == "Message-Properties"
*/
if (!String.prototype.dasherize)
{
    String.prototype.dasherize = function()
    {
        var str = this;
        str = str.replace(InflectionJS.space_or_underbar, '-');
        return str;
    };
}

/*
  This function adds titleize support to every String object
    Signature:
      String.titleize() == String
    Arguments:
      N/A
    Returns:
      String - capitalizes words as you would for a book title
    Examples:
      "message_properties".titleize() == "Message Properties"
      "message properties to keep".titleize() == "Message Properties to Keep"
*/
if (!String.prototype.titleize)
{
    String.prototype.titleize = function()
    {
        var str = this.toLowerCase();
        str = str.replace(InflectionJS.underbar, ' ');
        var str_arr = str.split(' ');
        for (var x = 0; x < str_arr.length; x++)
        {
            var d = str_arr[x].split('-');
            for (var i = 0; i < d.length; i++)
            {
                if (this._non_titlecased_words.indexOf(d[i].toLowerCase()) < 0)
                {
                    d[i] = d[i].capitalize();
                }
            }
            str_arr[x] = d.join('-');
        }
        str = str_arr.join(' ');
        str = str.substring(0, 1).toUpperCase() + str.substring(1);
        return str;
    };
}

/*
  This function adds demodulize support to every String object
    Signature:
      String.demodulize() == String
    Arguments:
      N/A
    Returns:
      String - removes module names leaving only class names (Ruby style)
    Examples:
      "Message::Bus::Properties".demodulize() == "Properties"
*/
if (!String.prototype.demodulize)
{
    String.prototype.demodulize = function()
    {
        var str = this;
        var str_arr = str.split('::');
        str = str_arr[str_arr.length - 1];
        return str;
    };
}

/*
  This function adds tableize support to every String object
    Signature:
      String.tableize() == String
    Arguments:
      N/A
    Returns:
      String - renders camel cased words into their underscored plural form
    Examples:
      "MessageBusProperty".tableize() == "message_bus_properties"
*/
if (!String.prototype.tableize)
{
    String.prototype.tableize = function()
    {
        var str = this;
        str = str.underscore().pluralize();
        return str;
    };
}

/*
  This function adds classification support to every String object
    Signature:
      String.classify() == String
    Arguments:
      N/A
    Returns:
      String - underscored plural nouns become the camel cased singular form
    Examples:
      "message_bus_properties".classify() == "MessageBusProperty"
*/
if (!String.prototype.classify)
{
    String.prototype.classify = function()
    {
        var str = this;
        str = str.camelize().singularize();
        return str;
    };
}

/*
  This function adds foreign key support to every String object
    Signature:
      String.foreign_key(dropIdUbar) == String
    Arguments:
      dropIdUbar - boolean (optional) - default is to seperate id with an
        underbar at the end of the class name, you can pass true to skip it
    Returns:
      String - camel cased singular class names become underscored with id
    Examples:
      "MessageBusProperty".foreign_key() == "message_bus_property_id"
      "MessageBusProperty".foreign_key(true) == "message_bus_propertyid"
*/
if (!String.prototype.foreign_key)
{
    String.prototype.foreign_key = function(dropIdUbar)
    {
        var str = this;
        str = str.demodulize().underscore() + ((dropIdUbar) ? ('') : ('_')) + 'id';
        return str;
    };
}

/*
  This function adds ordinalize support to every String object
    Signature:
      String.ordinalize() == String
    Arguments:
      N/A
    Returns:
      String - renders all found numbers their sequence like "22nd"
    Examples:
      "the 1 pitch".ordinalize() == "the 1st pitch"
*/
if (!String.prototype.ordinalize)
{
    String.prototype.ordinalize = function()
    {
        var str = this;
        var str_arr = str.split(' ');
        for (var x = 0; x < str_arr.length; x++)
        {
            var i = parseInt(str_arr[x], 10);
            if (i === NaN)
            {
                var ltd = str_arr[x].substring(str_arr[x].length - 2);
                var ld = str_arr[x].substring(str_arr[x].length - 1);
                var suf = "th";
                if (ltd != "11" && ltd != "12" && ltd != "13")
                {
                    if (ld === "1")
                    {
                        suf = "st";
                    }
                    else if (ld === "2")
                    {
                        suf = "nd";
                    }
                    else if (ld === "3")
                    {
                        suf = "rd";
                    }
                }
                str_arr[x] += suf;
            }
        }
        str = str_arr.join(' ');
        return str;
    };
}
;
define("inflection", function(){});

define('ometa!sbvr-parser/SBVRParser',["ometa!sbvr-parser/SBVRLibs","underscore","has","ometa-core","inflection"],(function (SBVRLibs,_,has){var SBVRParser=SBVRLibs._extend({
"EOL":function(){var _fromIdx=this.input.idx,$elf=this;return (function(){switch(this._apply('anything')){case "\r":return this._opt((function(){return this._applyWithArgs("exactly","\n")}));case "\n":return "\n";default: throw this._fail()}}).call(this)},
"EOLSpaces":function(){var _fromIdx=this.input.idx,eol,$elf=this;eol=false;this._many((function(){return this._or((function(){this._apply("EOL");return eol=true}),(function(){return this._apply("space")}))}));return this._pred(eol)},
"Bind":function(identifier,bindings){var _fromIdx=this.input.idx,binding,$elf=this;this._pred(this["ruleVars"].hasOwnProperty(identifier[(1)]));binding=["RoleBinding",identifier,this["ruleVars"][identifier[(1)]]];this._opt((function(){this._pred(bindings);return bindings.push(binding)}));return binding},
"spaces":function(){var _fromIdx=this.input.idx,$elf=this;return this._many((function(){this._not((function(){return this._apply("EOL")}));return this._apply("space")}))},
"Number":function(){var _fromIdx=this.input.idx,n,$elf=this;return this._or((function(){this._apply("spaces");n=this._consumedBy((function(){return this._many1((function(){return this._apply("digit")}))}));return ["Number",parseInt(n,(10))]}),(function(){this._applyWithArgs("token","one");return ["Number",(1)]}))},
"Value":function(stopOn){var _fromIdx=this.input.idx,$elf=this;this._apply("spaces");return this._consumedBy((function(){return this._many1((function(){this._apply("spaces");this._not((function(){return this._applyWithArgs("token",stopOn)}));return this._many1((function(){return this._apply("letterOrDigit")}))}))}))},
"toSBVREOL":function(){var _fromIdx=this.input.idx,$elf=this;this._apply("spaces");return this._consumedBy((function(){return this._many((function(){this._apply("spaces");return this._or((function(){return this._apply("InformalIdentifier")}),(function(){return (function(){switch(this._apply('anything')){case "'":return (function(){this._apply("InformalIdentifier");return this._applyWithArgs("exactly","'")}).call(this);default: throw this._fail()}}).call(this)}),(function(){return this._many1((function(){this._not((function(){return this._apply("space")}));return this._apply("anything")}))}))}))}))},
"toEOL":function(){var _fromIdx=this.input.idx,$elf=this;return this._consumedBy((function(){return this._many((function(){this._not((function(){return this._apply("EOL")}));return this._apply("anything")}))}))},
"token":function(x){var s,_fromIdx=this.input.idx,$elf=this;this._apply("spaces");s=this._applyWithArgs("seq",x);this._lookahead((function(){return this._or((function(){return this._apply("space")}),(function(){return this._apply("end")}))}));return s},
"AddIdentifier":function(identifierType,baseSynonym){var _fromIdx=this.input.idx,identifier,$elf=this;identifier=this._lookahead((function(){return this._many1((function(){return this._apply("IdentifierPart")}))}));identifier=identifier.join(" ");this._pred((! this["identifierChildren"].hasOwnProperty(identifier)));this._applyWithArgs("_AddIdentifier",identifierType,identifier,baseSynonym);return this._applyWithArgs("apply",identifierType)},
"InformalIdentifier":function(){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("Identifier",undefined,true)},
"Identifier":function(factTypeSoFar,noAutoComplete){var _fromIdx=this.input.idx,term,name,$elf=this;this._opt((function(){return this._not((function(){return term=this._consumedBy((function(){return this._opt((function(){return this._applyWithArgs("Term",factTypeSoFar)}))}))}))}));this._opt((function(){return this._not((function(){return name=this._consumedBy((function(){return this._opt((function(){return this._applyWithArgs("Name",factTypeSoFar)}))}))}))}));this._pred((((! noAutoComplete) || term) || name));return this._or((function(){this._pred((term["length"] > name["length"]));return this._applyWithArgs("Term",factTypeSoFar)}),(function(){return this._applyWithArgs("Name",factTypeSoFar)}))},
"Name":function(factTypeSoFar){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("FindIdentifier","Name",factTypeSoFar)},
"Term":function(factTypeSoFar){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("FindIdentifier","Term",factTypeSoFar)},
"FindIdentifier":function(identifierType,factTypeSoFar){var _fromIdx=this.input.idx,quote,identifier,$elf=this;this._apply("spaces");quote=this._opt((function(){return this._applyWithArgs("exactly","'")}));identifier=this._applyWithArgs("FindIdentifierNest",identifierType,factTypeSoFar);this._or((function(){return this._pred((! quote))}),(function(){return this._applyWithArgs("seq",quote)}));return identifier},
"FindIdentifierNest":function(identifierType,factTypeSoFar,identifierSoFar){var identifierSoFar,_fromIdx=this.input.idx,factTypeIdentifier,part,$elf=this;part=this._apply("IdentifierPart");identifierSoFar=this._or((function(){this._pred(identifierSoFar);return ((identifierSoFar + " ") + part)}),(function(){return part}));this._pred((identifierSoFar["length"] <= this["longestIdentifier"][identifierType]));return this._or((function(){return this._applyWithArgs("FindIdentifierNest",identifierType,factTypeSoFar,identifierSoFar)}),(function(){factTypeIdentifier=this._applyWithArgs("IsFactTypeIdentifier",identifierType,factTypeSoFar,identifierSoFar);this._pred((factTypeIdentifier !== false));return [identifierType,factTypeIdentifier]}))},
"IdentifierPart":function(){var _fromIdx=this.input.idx,$elf=this;this._apply("spaces");return this._consumedBy((function(){return this._many1((function(){return this._or((function(){return this._apply("letter")}),(function(){return (function(){switch(this._apply('anything')){case "-":return "-";default: throw this._fail()}}).call(this)}))}))}))},
"addVerb":function(){var _fromIdx=this.input.idx,$elf=this;this._apply("clearSuggestions");return this._applyWithArgs("Verb",true)},
"Verb":function(factTypeSoFar){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("FindVerb",factTypeSoFar)},
"FindVerb":function(factTypeSoFar,verbSoFar){var _fromIdx=this.input.idx,verbSoFar,part,$elf=this;part=this._apply("VerbPart");verbSoFar=this._or((function(){this._pred(verbSoFar);return ((verbSoFar + " ") + part)}),(function(){return part}));return this._or((function(){return this._applyWithArgs("FindVerb",factTypeSoFar,verbSoFar)}),(function(){this._or((function(){return this._pred((factTypeSoFar === true))}),(function(){return this._pred(this.isVerb(factTypeSoFar,verbSoFar))}));return ["Verb",this._verbForm(verbSoFar)]}))},
"VerbPart":function(){var _fromIdx=this.input.idx,$elf=this;this._apply("spaces");this._not((function(){return this._apply("Identifier")}));return this._apply("IdentifierPart")},
"JoiningQuantifier":function(){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("matchForAll","keyword",["and","at","most"])},
"Quantifier":function(){var _fromIdx=this.input.idx,n,m,$elf=this;return this._or((function(){this._applyWithArgs("keyword","each");return ["UniversalQuantification"]}),(function(){this._applyWithArgs("matchForAny","keyword",["a","an","some"]);return ["ExistentialQuantification"]}),(function(){this._applyWithArgs("matchForAll","keyword",["at","most"]);n=this._apply("Number");return ["AtMostNQuantification",["MaximumCardinality",n]]}),(function(){this._applyWithArgs("matchForAll","keyword",["at","least"]);n=this._apply("Number");return this._or((function(){this._apply("JoiningQuantifier");m=this._apply("Number");return ["NumericalRangeQuantification",["MinimumCardinality",n],["MaximumCardinality",m]]}),(function(){return ["AtLeastNQuantification",["MinimumCardinality",n]]}))}),(function(){this._applyWithArgs("matchForAll","keyword",["more","than"]);n=this._apply("Number");++n[(1)];return ["AtLeastNQuantification",["MinimumCardinality",n]]}),(function(){this._applyWithArgs("keyword","exactly");n=this._apply("Number");return ["ExactQuantification",["Cardinality",n]]}),(function(){this._applyWithArgs("keyword","no");return ["ExactQuantification",["Cardinality",(0)]]}))},
"keyword":function(word,noToken){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){this._pred((noToken === true));return this._applyWithArgs("seq",word)}),(function(){this._pred((noToken !== true));return this._applyWithArgs("token",word)}))},
"addThat":function(){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("keyword","that")},
"addThe":function(){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("keyword","the")},
"addComma":function(){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("keyword",",")},
"addOr":function(){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("keyword","or")},
"createVar":function(identifier,unitary){var _fromIdx=this.input.idx,$elf=this;(this["ruleVars"][identifier[(1)]]=this["ruleVarsCount"]++);return ["Variable",["Number",this["ruleVars"][identifier[(1)]]],identifier]},
"IsAtomicFormulation":function(factType,bindings){var _fromIdx=this.input.idx,realFactType,$elf=this;realFactType=this._applyWithArgs("IsFactType",factType);this._pred(realFactType);return ["AtomicFormulation"].concat([["FactType"].concat(factType)],bindings)},
"ClosedProjection":function(identifier,bind){var _fromIdx=this.input.idx,verb,factType,$elf=this;this._apply("addThat");return this._or((function(){factType=[identifier];verb=this._applyWithArgs("Verb",factType);factType.push(verb);return this._or((function(){return this._applyWithArgs("RuleBody",factType,[bind])}),(function(){return this._applyWithArgs("IsAtomicFormulation",factType,[bind])}))}),(function(){return this._applyWithArgs("RuleBody",[],[],identifier,bind)}))},
"RuleBody":function(factType,bindings,parentIdentifier,parentBind){var v,b,_fromIdx=this.input.idx,quant,thatLF,t,tVar,lf,identifier,$elf=this;this._or((function(){quant=this._apply("Quantifier");t=this._applyWithArgs("Term",factType);tVar=this._applyWithArgs("createVar",t);b=this._applyWithArgs("Bind",t,bindings);factType.push(t);return this._opt((function(){thatLF=this._applyWithArgs("ClosedProjection",t,b);tVar.push(thatLF);return this._opt((function(){return this._apply("addComma")}))}))}),(function(){this._apply("addThe");identifier=this._applyWithArgs("Identifier",factType);this._or((function(){return this._applyWithArgs("Bind",identifier,bindings)}),(function(){tVar=this._applyWithArgs("createVar",identifier,true);return this._applyWithArgs("Bind",identifier,bindings)}));return factType.push(identifier)}));lf=this._or((function(){v=this._applyWithArgs("Verb",factType);factType.push(v);(function (){if((parentIdentifier != null)){factType.push(parentIdentifier);bindings.push(parentBind)}else{undefined}}).call(this);return this._or((function(){return this._applyWithArgs("RuleBody",factType,bindings)}),(function(){return this._applyWithArgs("IsAtomicFormulation",factType,bindings)}))}),(function(){return this._applyWithArgs("IsAtomicFormulation",factType,bindings)}));return ((quant == null)?lf:quant.concat([tVar,lf]))},
"Modifier":function(){var _fromIdx=this.input.idx,r,$elf=this;this._applyWithArgs("token","It");this._applyWithArgs("token","is");r=this._or((function(){this._applyWithArgs("token","obligatory");return ["ObligationFormulation"]}),(function(){this._applyWithArgs("token","necessary");return ["NecessityFormulation"]}),(function(){this._applyWithArgs("token","prohibited");return ["ObligationFormulation",["LogicalNegation"]]}),(function(){this._applyWithArgs("token","impossible");return ["NecessityFormulation",["LogicalNegation"]]}),(function(){this._applyWithArgs("token","not");this._applyWithArgs("token","possible");return ["NecessityFormulation",["LogicalNegation"]]}),(function(){this._applyWithArgs("token","possible");return ["PossibilityFormulation"]}),(function(){this._applyWithArgs("token","permitted");return ["PermissibilityFormulation"]}));this._applyWithArgs("token","that");return r},
"startRule":function(){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){return this._applyWithArgs("token","R:")}),(function(){return this._applyWithArgs("token","Rule:")}))},
"NewRule":function(){var _fromIdx=this.input.idx,ruleText,ruleLF,mod,$elf=this;this._apply("startRule");this._apply("spaces");ruleText=this._lookahead((function(){return this._apply("toEOL")}));(this["ruleVarsCount"]=(0));mod=this._apply("Modifier");ruleLF=this._applyWithArgs("RuleBody",[],[]);this._apply("EOLTerminator");((mod["length"] == (2))?(mod[(1)][(1)]=ruleLF):(mod[(1)]=ruleLF));return ["Rule",mod,["StructuredEnglish",ruleText]]},
"startFactType":function(){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){return this._applyWithArgs("token","F:")}),(function(){return this._applyWithArgs("token","Fact type:")}))},
"newFactType":function(){var v,_fromIdx=this.input.idx,factType,identifier,$elf=this;this._apply("startFactType");factType=[];this._many1((function(){identifier=this._apply("Identifier");v=this._apply("addVerb");return factType.push(identifier,v)}));this._opt((function(){identifier=this._apply("Identifier");return factType.push(identifier)}));this._applyWithArgs("AddFactType",factType,factType);factType.push(["Attributes"]);return ["FactType"].concat(factType)},
"StartTerm":function(){var _fromIdx=this.input.idx,$elf=this;this._or((function(){return this._applyWithArgs("token","T:")}),(function(){return this._applyWithArgs("token","Term:")}));return "Term"},
"StartName":function(){var _fromIdx=this.input.idx,$elf=this;this._or((function(){return this._applyWithArgs("token","N:")}),(function(){return this._applyWithArgs("token","Name:")}));return "Name"},
"NewIdentifier":function(){var _fromIdx=this.input.idx,identifierType,identifier,$elf=this;identifierType=this._or((function(){return this._apply("StartTerm")}),(function(){return this._apply("StartName")}));this._apply("clearSuggestions");identifier=this._applyWithArgs("AddIdentifier",identifierType);identifier.push(["Attributes"]);return identifier},
"Attribute":function(){var currentLine,_fromIdx=this.input.idx,attrVal,attrName,$elf=this;currentLine=this["lines"][(this["lines"]["length"] - (1))];attrName=this._applyWithArgs("AllowedAttrs",currentLine[(0)]);attrName=attrName.replace(/ /g,"");this._apply("spaces");attrVal=this._applyWithArgs("ApplyFirstExisting",[("Attr" + attrName),"DefaultAttr"],[currentLine]);return (function (){var lastLine = this["lines"].pop();lastLine[(lastLine["length"] - (1))].push([attrName,attrVal]);return lastLine}).call(this)},
"AllowedAttrs":function(termOrFactType){var _fromIdx=this.input.idx,attrName,$elf=this;attrName=this._applyWithArgs("matchForAny","seq",this["branches"]["AllowedAttrs"].call(this,termOrFactType));return attrName.replace(":","")},
"DefaultAttr":function(currentLine){var _fromIdx=this.input.idx,$elf=this;return this._apply("toSBVREOL")},
"AttrConceptType":function(currentLine){var _fromIdx=this.input.idx,termName,term,identifierName,$elf=this;identifierName=currentLine[(1)];this._pred((! this["conceptTypes"].hasOwnProperty(identifierName)));term=this._apply("Term");this._or((function(){return this._pred((currentLine[(0)] == "FactType"))}),(function(){termName=term[(1)];this._pred((identifierName != termName));(this["conceptTypes"][identifierName]=termName);return this["identifierChildren"][termName].push(identifierName)}));return term},
"AttrDefinition":function(currentLine){var b,_fromIdx=this.input.idx,thatLF,names,t,tVar,name,$elf=this;return this._or((function(){this._opt((function(){return this._apply("addThe")}));(this["ruleVarsCount"]=(0));t=this._apply("Term");tVar=this._applyWithArgs("createVar",t);b=this._applyWithArgs("Bind",t);thatLF=this._applyWithArgs("ClosedProjection",t,b);tVar.push(thatLF);this._opt((function(){return this._or((function(){return this._pred((currentLine[(0)] == "FactType"))}),(function(){(this["conceptTypes"][currentLine[(1)]]=t[(1)]);return this["identifierChildren"][t[(1)]].push(currentLine[(1)])}))}));return tVar}),(function(){name=this._applyWithArgs("Value","or");names=this._many1((function(){this._apply("addOr");this._apply("clearSuggestions");return this._applyWithArgs("Value","or")}));names.unshift(name);return ["Enum",names]}))},
"AttrGuidanceType":function(currentLine){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("matchForAny","seq",this["branches"]["AttrGuidanceType"])},
"AttrNecessity":function(currentLine){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){this._applyWithArgs("RuleBody",[],[]);return this._apply("EOLTerminator")}),(function(){return this._apply("toSBVREOL")}))},
"AttrSynonym":function(currentLine){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("AddIdentifier",currentLine[(0)],currentLine[(1)])},
"AttrSynonymousForm":function(currentLine){var v,_fromIdx=this.input.idx,factType,identifier,$elf=this;factType=[];this._many1((function(){identifier=this._apply("Identifier");v=this._apply("addVerb");return factType.push(identifier,v)}));this._opt((function(){identifier=this._apply("Identifier");return factType.push(identifier)}));this._applyWithArgs("AddFactType",factType,currentLine.slice((1),(- (1))));return factType},
"AttrTermForm":function(currentLine){var _fromIdx=this.input.idx,term,$elf=this;term=this._applyWithArgs("AddIdentifier","Term");(function (){for(var i = (0);(i < currentLine["length"]);i++){if((currentLine[i][(0)] == "Term")){var factType = [term,["Verb","has"],currentLine[i]];this.AddFactType(factType,factType)}else{undefined}}}).call(this);return term},
"startComment":function(){var _fromIdx=this.input.idx,$elf=this;this._applyWithArgs("exactly","-");this._applyWithArgs("exactly","-");return "--"},
"newComment":function(){var _fromIdx=this.input.idx,$elf=this;this._apply("startComment");return this._apply("toEOL")},
"EOLTerminator":function(){var _fromIdx=this.input.idx,$elf=this;this._opt((function(){return this._apply("Terminator")}));this._apply("spaces");return this._lookahead((function(){return this._or((function(){return this._apply("EOL")}),(function(){return this._apply("end")}))}))},
"Terminator":function(){var _fromIdx=this.input.idx,$elf=this;this._apply("spaces");return this._applyWithArgs("keyword",".",true)},
"line":function(){var _fromIdx=this.input.idx,l,$elf=this;this._apply("spaces");return this._or((function(){l=this._or((function(){return this._apply("NewIdentifier")}),(function(){return this._apply("newFactType")}),(function(){return this._apply("NewRule")}),(function(){return this._apply("Attribute")}));this._apply("clearSuggestions");this["lines"].push(l);return l}),(function(){return this._apply("newComment")}))},
"Process":function(){var _fromIdx=this.input.idx,$elf=this;this._opt((function(){return this._apply("EOLSpaces")}));this._apply("line");this._many((function(){this._apply("EOLSpaces");return this._apply("line")}));this._many((function(){return this._apply("space")}));this._apply("end");return this["lines"]}});(SBVRParser["clearSuggestions"]=(function (){}));(SBVRParser["initialize"]=(function (){(this["tokensEnabled"]=false);this.reset()}));(SBVRParser["_enableTokens"]=(function (){(this["tokensEnabled"]=true);SBVRLibs["_enableTokens"].call(this,["StartTerm","StartName","startFactType","startRule","newComment","Term","Name","Modifier","Verb","keyword","AllowedAttrs","AttrGuidanceType","Number","Value"])}));(SBVRParser["_sideEffectingRules"]=["Process","line","NewIdentifier","AddIdentifier","newFactType","AddFactType","Attribute","AttrConceptType","AttrDefinition","AttrSynonym","AttrSynonymousForm","AttrTermForm"]);(SBVRParser["_AddIdentifier"]=(function (identifierType,identifier,baseSynonym){if((baseSynonym == null)){(baseSynonym=identifier);(this["identifierChildren"][baseSynonym]=[])}else{this["identifierChildren"][baseSynonym].push(identifier)};(this["identifiers"][identifierType][identifier]=baseSynonym);(this["longestIdentifier"][identifierType]=Math.max(identifier["length"],identifier.pluralize()["length"],this["longestIdentifier"][identifierType]))}));(SBVRParser["BaseSynonym"]=(function (identifierType,identifier){var identifiers = this["identifiers"][identifierType];if(identifiers.hasOwnProperty(identifier)){return identifiers[identifier]}else{undefined};(identifier=identifier.singularize());if(identifiers.hasOwnProperty(identifier)){return identifiers[identifier]}else{undefined};return false}));(SBVRParser["IsFactTypeIdentifier"]=(function (identifierType,factTypeSoFar,identifier){(identifier=this.BaseSynonym(identifierType,identifier));if((identifier === false)){return false}else{undefined};var identifiers = this["branches"][identifierType].call(this,factTypeSoFar);if((identifiers.indexOf(identifier) !== (- (1)))){return identifier}else{undefined};return false}));(SBVRParser["isVerb"]=(function (factTypeSoFar,verb){(verb=["Verb",this._verbForm(verb)]);var currentLevel = this._traverseFactType(factTypeSoFar);if((currentLevel === false)){return false}else{undefined};if(currentLevel.hasOwnProperty(verb)){return true}else{undefined};if((currentLevel.hasOwnProperty("__valid") && (currentLevel["__valid"] === true))){return this.isVerb([],verb)}else{undefined};return false}));(SBVRParser["_verbForm"]=(function (verb){if((verb.slice((0),(4)) == "are ")){return ("is " + verb.slice((4)))}else{undefined};if((verb == "are")){return "is"}else{undefined};if((verb == "have")){return "has"}else{undefined};return verb}));(SBVRParser["IsFactType"]=(function (factType){var currentLevel = this._traverseFactType(factType);if((currentLevel === false)){return false}else{undefined};return currentLevel["__valid"]}));var removeRegex = ({"Verb": new RegExp(("^" + ["Verb",""].toString())),"Term": new RegExp(("^" + ["Term",""].toString())),"Name": new RegExp(("^" + ["Name",""].toString()))}),allowedAttrLists = ["Concept Type:","Definition:","Definition (Informal):","Description:","Dictionary Basis:","Example:","General Concept:","Namespace URI:","Necessity:","Note:","Possibility:","Reference Scheme:","See:","Source:","Subject Field:"];if(true){(allowedAttrLists=["Database ID Field:","Database Value Field:","Database Table Name:"].concat(allowedAttrLists))}else{undefined};(allowedAttrLists=({"Term": ["Synonym:"].concat(allowedAttrLists),"Name": ["Synonym:"].concat(allowedAttrLists),"FactType": ["Synonymous Form:","Term Form:"].concat(allowedAttrLists),"Rule": ["Rule Name:","Guidance Type:","Source:","Synonymous Statement:","Note:","Example:","Enforcement Level:"]}));var getValidFactTypeParts = (function (partType,factTypeSoFar){if(((factTypeSoFar == null) || (factTypeSoFar["length"] == (0)))){if(this["identifiers"].hasOwnProperty(partType)){return _.keys(this["identifiers"][partType])}else{return []}}else{undefined};var factTypePart,currentLevel = this._traverseFactType(factTypeSoFar),factTypeParts = [],regex = removeRegex[partType];for(factTypePart in currentLevel){if(currentLevel.hasOwnProperty(factTypePart)){if(regex.test(factTypePart)){(factTypePart=factTypePart.replace(regex,""));factTypeParts.push(factTypePart);if(this["identifierChildren"].hasOwnProperty(factTypePart)){(factTypeParts=factTypeParts.concat(this["identifierChildren"][factTypePart]))}else{undefined}}else{undefined}}else{undefined}};return factTypeParts});(SBVRParser["reset"]=(function (){SBVRLibs["initialize"].call(this);(this["branches"]=({"clearSuggestions": [],"StartTerm": ["Term:     "],"StartName": ["Name:     "],"startFactType": ["Fact type:"],"startRule": ["Rule:     "],"Term": (function (factTypeSoFar){return getValidFactTypeParts.call(this,"Term",factTypeSoFar)}),"Name": (function (factTypeSoFar){return getValidFactTypeParts.call(this,"Name",factTypeSoFar)}),"Verb": (function (factTypeSoFar){return getValidFactTypeParts.call(this,"Verb",factTypeSoFar)}),"AllowedAttrs": (function (termOrFactType){if(allowedAttrLists.hasOwnProperty(termOrFactType)){return allowedAttrLists[termOrFactType]}else{if((termOrFactType == null)){return allowedAttrLists["Term"].concat(allowedAttrLists["Name"],allowedAttrLists["FactType"])}else{undefined}};return []}),"AttrGuidanceType": ["operative business rule","structural business rule","advice of permission","advice of possibility","advice of optionality","advice of contingency"],"Modifier": ["It is obligatory that","It is necessary that","It is prohibited that","It is impossible that","It is not possible that","It is possible that","It is permitted that"],"Quantifier": ["each","a","an","some","at most","at least","more than","exactly","no"],"JoiningQuantifier": ["and at most"],"Number": ["1","2","3","4","5","6","7","8","9","one"],"addThat": ["that","that the"],"addThe": ["the"],"addComma": [","],"addOr": ["or"],"Terminator": ["."]}));(this["identifiers"]=({"Term": ({}),"Name": ({})}));(this["longestIdentifier"]=({"Term": (0),"Name": (0)}));(this["identifierChildren"]=({}));(this["ruleVars"]=({}));(this["ruleVarsCount"]=(0));(this["lines"]=["Model"])}));(SBVRParser["matchForAny"]=(function (rule,arr){var $elf = this,origInput = this["input"],ref = ({}),result = ref;for(var idx = (0);(idx < arr["length"]);idx++){try {($elf["input"]=origInput);(result=$elf["_applyWithArgs"].call($elf,rule,arr[idx]))}catch(e){if((! (e instanceof SyntaxError))){throw e}else{undefined}}finally{undefined};if((result !== ref)){return result}else{undefined}};throw this._fail()}));(SBVRParser["matchForAll"]=(function (rule,arr){for(var idx = (0);(idx < arr["length"]);idx++){this["_applyWithArgs"].call(this,rule,arr[idx])}}));(SBVRParser["exactly"]=(function (wanted){if((wanted.toLowerCase() === this._apply("lowerCaseAnything"))){return wanted}else{undefined};throw this._fail()}));(SBVRParser["lowerCaseAnything"]=(function (){return this._apply("anything").toLowerCase()}));SBVRParser._disablePrependingInput();return SBVRParser}));
define('ometa!sbvr-compiler/LFValidator',["ometa!sbvr-parser/SBVRLibs","ometa-core"],(function (SBVRLibs){var LFValidator=SBVRLibs._extend({
"$":function(x){var _fromIdx=this.input.idx,a,$elf=this;return this._or((function(){a=this._applyWithArgs("token",x);return [a]}),(function(){return []}))},
"trans":function(){var _fromIdx=this.input.idx,a,t,$elf=this;this._form((function(){t=this._apply("anything");return a=this._applyWithArgs("apply",t)}));return a},
"token":function(x){var _fromIdx=this.input.idx,a,t,$elf=this;this._form((function(){t=this._apply("anything");this._pred((t == x));return a=this._applyWithArgs("apply",x)}));return a},
"letters":function(){var _fromIdx=this.input.idx,l,$elf=this;l=this._many1((function(){return this._apply("letter")}));this._many((function(){return this._apply("space")}));return l.join("")},
"Number":function(){var _fromIdx=this.input.idx,n,$elf=this;n=this._apply("number");this._pred((! isNaN(n)));return ["Number",parseInt(n)]},
"Model":function(){var _fromIdx=this.input.idx,x,xs,$elf=this;xs=[];this._many((function(){x=this._or((function(){return this._applyWithArgs("token","Term")}),(function(){return this._applyWithArgs("token","FactType")}),(function(){return this._applyWithArgs("token","Rule")}));return this._opt((function(){this._pred((x != null));return xs.push(x)}))}));return ["Model"].concat(xs)},
"FactType":function(){var v,_fromIdx=this.input.idx,t,factType,attrs,$elf=this;factType=[];this._many((function(){t=this._applyWithArgs("token","Term");v=this._applyWithArgs("token","Verb");return factType=factType.concat([t,v])}));t=this._applyWithArgs("$","Term");factType=factType.concat(t);this._opt((function(){return this._lookahead((function(){attrs=this._apply("anything");return this._applyWithArgs("AddFactType",factType,factType)}))}));return this._applyWithArgs("addAttributes",["FactType"].concat(factType))},
"Term":function(){var _fromIdx=this.input.idx,t,$elf=this;t=this._apply("anything");return this._applyWithArgs("addAttributes",["Term",t])},
"Verb":function(){var v,_fromIdx=this.input.idx,$elf=this;v=this._apply("anything");return ["Verb",v]},
"Rule":function(){var _fromIdx=this.input.idx,x,t,$elf=this;x=this._or((function(){return this._applyWithArgs("token","ObligationFormulation")}),(function(){return this._applyWithArgs("token","NecessityFormulation")}),(function(){return this._applyWithArgs("token","PossibilityFormulation")}),(function(){return this._applyWithArgs("token","PermissibilityFormulation")}));t=this._applyWithArgs("token","StructuredEnglish");return ["Rule",x,t]},
"addAttributes":function(termOrVerb){var attrsFound,_fromIdx=this.input.idx,attrVal,attrName,attrs,$elf=this;this._or((function(){return this._apply("end")}),(function(){attrsFound=({});this._form((function(){attrs=this._many((function(){return this._or((function(){return (function(){switch(this._apply('anything')){case "Attributes":return "Attributes";default: throw this._fail()}}).call(this)}),(function(){this._form((function(){attrName=this._apply("anything");attrVal=this._applyWithArgs("ApplyFirstExisting",[("Attr" + attrName),"DefaultAttr"],[termOrVerb]);return (attrsFound[attrName]=attrVal)}));return [attrName,attrVal]}))}));return this._apply("end")}));return this._applyWithArgs("defaultAttributes",termOrVerb,attrsFound,attrs)}));return termOrVerb},
"DefaultAttr":function(tableID){var _fromIdx=this.input.idx,$elf=this;return this._apply("anything")},
"AttrConceptType":function(termName){var _fromIdx=this.input.idx,conceptType,$elf=this;return this._form((function(){this._applyWithArgs("exactly","Term");conceptType=this._apply("anything");return (this["conceptTypes"][termName[(1)]]=conceptType)}))},
"AttrDefinition":function(termOrVerb){var _fromIdx=this.input.idx,values,$elf=this;return this._or((function(){return this._form((function(){this._applyWithArgs("exactly","Enum");return values=this._apply("anything")}))}),(function(){return this._apply("trans")}))},
"AttrSynonymousForm":function(factType){var synForm,_fromIdx=this.input.idx,$elf=this;synForm=this._apply("anything");this._applyWithArgs("AddFactType",synForm,factType.slice((1)));return synForm},
"StructuredEnglish":function(){var _fromIdx=this.input.idx,a,$elf=this;a=this._apply("anything");return ["StructuredEnglish",a]},
"ObligationFormulation":function(){var _fromIdx=this.input.idx,xs,$elf=this;xs=this._many((function(){return this._apply("trans")}));return ["ObligationFormulation"].concat(xs)},
"NecessityFormulation":function(){var _fromIdx=this.input.idx,xs,$elf=this;xs=this._many((function(){return this._apply("trans")}));return ["NecessityFormulation"].concat(xs)},
"PossibilityFormulation":function(){var _fromIdx=this.input.idx,xs,$elf=this;xs=this._many((function(){return this._apply("trans")}));return ["PossibilityFormulation"].concat(xs)},
"PermissibilityFormulation":function(){var _fromIdx=this.input.idx,xs,$elf=this;xs=this._many((function(){return this._apply("trans")}));return ["PermissibilityFormulation"].concat(xs)},
"LogicalNegation":function(){var _fromIdx=this.input.idx,xs,$elf=this;xs=this._apply("trans");return ["LogicalNegation"].concat([xs])},
"quant":function(){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){return this._applyWithArgs("token","UniversalQuantification")}),(function(){return this._applyWithArgs("token","ExistentialQuantification")}),(function(){return this._applyWithArgs("token","ExactQuantification")}),(function(){return this._applyWithArgs("token","AtMostNQuantification")}),(function(){return this._applyWithArgs("token","AtLeastNQuantification")}),(function(){return this._applyWithArgs("token","NumericalRangeQuantification")}))},
"UniversalQuantification":function(){var v,_fromIdx=this.input.idx,xs,$elf=this;v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));return ["UniversalQuantification",v].concat(xs)},
"ExistentialQuantification":function(){var v,_fromIdx=this.input.idx,xs,$elf=this;v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));return ["ExistentialQuantification",v].concat(xs)},
"ExactQuantification":function(){var v,_fromIdx=this.input.idx,xs,i,$elf=this;i=this._applyWithArgs("token","Cardinality");v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));return ["ExactQuantification",i,v].concat(xs)},
"AtMostNQuantification":function(){var v,_fromIdx=this.input.idx,a,xs,$elf=this;a=this._applyWithArgs("token","MaximumCardinality");v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));return ["AtMostNQuantification",a,v].concat(xs)},
"AtLeastNQuantification":function(){var v,_fromIdx=this.input.idx,xs,i,$elf=this;i=this._applyWithArgs("token","MinimumCardinality");v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));return ["AtLeastNQuantification",i,v].concat(xs)},
"NumericalRangeQuantification":function(){var v,_fromIdx=this.input.idx,a,xs,i,$elf=this;i=this._applyWithArgs("token","MinimumCardinality");a=this._applyWithArgs("token","MaximumCardinality");v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));return ["NumericalRangeQuantification",i,a,v].concat(xs)},
"Cardinality":function(){var _fromIdx=this.input.idx,n,$elf=this;n=this._applyWithArgs("token","Number");return ["Cardinality",n]},
"MinimumCardinality":function(){var _fromIdx=this.input.idx,n,$elf=this;n=this._applyWithArgs("token","Number");return ["MinimumCardinality",n]},
"MaximumCardinality":function(){var _fromIdx=this.input.idx,n,$elf=this;n=this._applyWithArgs("token","Number");return ["MaximumCardinality",n]},
"Variable":function(){var _fromIdx=this.input.idx,num,term,w,$elf=this;num=this._applyWithArgs("token","Number");term=this._applyWithArgs("token","Term");w=this._many((function(){return this._or((function(){return this._applyWithArgs("token","AtomicFormulation")}),(function(){return this._apply("quant")}))}));return ["Variable",num,term].concat(w)},
"RoleBinding":function(){var _fromIdx=this.input.idx,n,t,$elf=this;t=this._applyWithArgs("token","Term");n=this._apply("number");return ["RoleBinding",t,n]},
"AtomicFormulation":function(){var b,_fromIdx=this.input.idx,f,$elf=this;f=this._applyWithArgs("token","FactType");b=this._many((function(){return this._applyWithArgs("token","RoleBinding")}));return ["AtomicFormulation",f].concat(b)}});(LFValidator["initialize"]=(function (){SBVRLibs["initialize"].call(this)}));(LFValidator["defaultAttributes"]=(function (termOrVerb,attrsFound,attrs){termOrVerb.push(attrs)}));return LFValidator}));
define('ometa!sbvr-compiler/LFOptimiser',["ometa!sbvr-compiler/LFValidator"],(function (LFValidator){var LFOptimiser=LFValidator._extend({
"Helped":function(){var _fromIdx=this.input.idx,$elf=this;this._pred((this["helped"] === true));return (this["helped"]=false)},
"SetHelped":function(){var _fromIdx=this.input.idx,$elf=this;return (this["helped"]=true)},
"Process":function(){var _fromIdx=this.input.idx,x,$elf=this;x=this._apply("anything");x=this._applyWithArgs("trans",x);this._many((function(){this._applyWithArgs("Helped","disableMemoisation");return x=this._applyWithArgs("trans",x)}));return x},
"AtLeastNQuantification":function(){var v,_fromIdx=this.input.idx,xs,i,$elf=this;return this._or((function(){i=this._applyWithArgs("token","MinimumCardinality");this._pred((i[(1)][(1)] == (1)));v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));this._apply("SetHelped");return ["ExistentialQuantification",v].concat(xs)}),(function(){return LFValidator._superApplyWithArgs(this,'AtLeastNQuantification')}))},
"NumericalRangeQuantification":function(){var v,_fromIdx=this.input.idx,j,xs,i,$elf=this;return this._or((function(){i=this._applyWithArgs("token","MinimumCardinality");j=this._applyWithArgs("token","MaximumCardinality");this._pred((i[(1)][(1)] == j[(1)][(1)]));v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));this._apply("SetHelped");return ["ExactQuantification",["Cardinality",i[(1)]],v].concat(xs)}),(function(){return LFValidator._superApplyWithArgs(this,'NumericalRangeQuantification')}))},
"LogicalNegation":function(){var _fromIdx=this.input.idx,xs,$elf=this;return this._or((function(){this._form((function(){this._applyWithArgs("exactly","LogicalNegation");return xs=this._apply("trans")}));this._apply("SetHelped");return xs}),(function(){return LFValidator._superApplyWithArgs(this,'LogicalNegation')}))}});(LFOptimiser["initialize"]=(function (){LFValidator["initialize"].call(this);(this["_didSomething"]=false)}));return LFOptimiser}));
define('ometa!sbvr-compiler/LF2AbstractSQLPrep',["ometa!sbvr-compiler/LFOptimiser"],(function (LFOptimiser){var LF2AbstractSQLPrep=LFOptimiser._extend({
"AttrConceptType":function(termName){var _fromIdx=this.input.idx,conceptType,$elf=this;conceptType=LFOptimiser._superApplyWithArgs(this,'AttrConceptType',termName);this._opt((function(){this._pred(((this["primitives"][termName] === false) && (this["primitives"][conceptType] !== false)));(this["primitives"][conceptType]=false);return this._apply("SetHelped")}));return conceptType},
"AttrDatabaseAttribute":function(termOrFactType){var _fromIdx=this.input.idx,attrVal,newAttrVal,$elf=this;attrVal=this._apply("anything");newAttrVal=(((termOrFactType[(0)] == "Term") && ((! this["attributes"].hasOwnProperty(termOrFactType[(3)])) || (this["attributes"][termOrFactType[(3)]] === true))) || (((((termOrFactType[(0)] == "FactType") && (termOrFactType["length"] == (4))) && ((! this["attributes"].hasOwnProperty(termOrFactType[(3)])) || (this["attributes"][termOrFactType[(3)]] === true))) && this["primitives"].hasOwnProperty(termOrFactType[(3)])) && (this["primitives"][termOrFactType[(3)]] !== false)));(this["attributes"][termOrFactType]=newAttrVal);this._opt((function(){this._pred((newAttrVal != attrVal));return this._apply("SetHelped")}));return newAttrVal},
"AttrDatabasePrimitive":function(termOrFactType){var _fromIdx=this.input.idx,attrVal,newAttrVal,$elf=this;attrVal=this._apply("anything");newAttrVal=attrVal;this._opt((function(){this._pred(this["primitives"].hasOwnProperty(termOrFactType));newAttrVal=this["primitives"][termOrFactType];this._pred((newAttrVal != attrVal));return this._apply("SetHelped")}));(this["primitives"][termOrFactType]=newAttrVal);return newAttrVal},
"UniversalQuantification":function(){var v,_fromIdx=this.input.idx,xs,$elf=this;v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));this._apply("SetHelped");return ["LogicalNegation",["ExistentialQuantification",v,["LogicalNegation"].concat(xs)]]},
"AtMostNQuantification":function(){var v,_fromIdx=this.input.idx,xs,maxCard,$elf=this;maxCard=this._applyWithArgs("token","MaximumCardinality");v=this._applyWithArgs("token","Variable");xs=this._many((function(){return this._apply("trans")}));this._apply("SetHelped");maxCard[(1)][(1)]++;return ["LogicalNegation",["AtLeastNQuantification",["MinimumCardinality",maxCard[(1)]],v].concat(xs)]},
"ForeignKey":function(v1){var actualFactType,_fromIdx=this.input.idx,card,v2,necessity,atomicForm,factType,$elf=this;this._pred((v1["length"] == (3)));this._or((function(){return this._form((function(){this._applyWithArgs("exactly","ExactQuantification");card=this._applyWithArgs("token","Cardinality");this._pred((card[(1)][(1)] == (1)));v2=this._applyWithArgs("token","Variable");this._pred((v2["length"] == (3)));atomicForm=this._applyWithArgs("token","AtomicFormulation");return necessity="NOT NULL"}))}),(function(){return this._form((function(){this._applyWithArgs("exactly","AtMostNQuantification");card=this._applyWithArgs("token","MaximumCardinality");this._pred((card[(1)][(1)] == (1)));v2=this._applyWithArgs("token","Variable");this._pred((v2["length"] == (3)));atomicForm=this._applyWithArgs("token","AtomicFormulation");return necessity="NULL"}))}));factType=atomicForm[(1)];this._pred(((atomicForm["length"] == (4)) && (factType["length"] == (4))));actualFactType=this._applyWithArgs("ActualFactType",factType.slice((1)));this._pred(((v1[(2)][(1)] == actualFactType[(0)][(1)]) && (v2[(2)][(1)] == actualFactType[(2)][(1)])));(this["foreignKeys"][factType]=necessity);return this._apply("SetHelped")},
"Rule":function(){var _fromIdx=this.input.idx,v1,$elf=this;return this._or((function(){this._form((function(){this._applyWithArgs("exactly","ObligationFormulation");return this._form((function(){return (function(){switch(this._apply('anything')){case "LogicalNegation":return this._form((function(){this._applyWithArgs("exactly","ExistentialQuantification");v1=this._applyWithArgs("token","Variable");return this._form((function(){this._applyWithArgs("exactly","LogicalNegation");return this._applyWithArgs("ForeignKey",v1)}))}));case "UniversalQuantification":return (function(){v1=this._applyWithArgs("token","Variable");return this._applyWithArgs("ForeignKey",v1)}).call(this);default: throw this._fail()}}).call(this)}))}));this._applyWithArgs("token","StructuredEnglish");return null}),(function(){return LFOptimiser._superApplyWithArgs(this,'Rule')}))}});(LF2AbstractSQLPrep["initialize"]=(function (){LFOptimiser["initialize"].call(this);(this["foreignKeys"]=({}));(this["primitives"]=({}));(this["attributes"]=({}))}));(LF2AbstractSQLPrep["defaultAttributes"]=(function (termOrVerb,attrsFound,attrs){if((! attrsFound.hasOwnProperty("DatabaseIDField"))){attrs.push(["DatabaseIDField","id"]);this.SetHelped()}else{undefined};switch(termOrVerb[(0)]){case "Term": {if((! attrsFound.hasOwnProperty("DatabaseValueField"))){attrs.push(["DatabaseValueField","value"]);this.SetHelped()}else{undefined}if((! attrsFound.hasOwnProperty("DatabaseTableName"))){attrs.push(["DatabaseTableName",termOrVerb[(1)].replace(new RegExp(" ","g"),"_")]);this.SetHelped()}else{undefined}if((! attrsFound.hasOwnProperty("DatabasePrimitive"))){if((! this["primitives"].hasOwnProperty(termOrVerb))){(this["primitives"][termOrVerb]=this.IsPrimitive(termOrVerb[(1)]))}else{undefined};attrs.push(["DatabasePrimitive",this["primitives"][termOrVerb]]);this.SetHelped()}else{undefined}break};case "FactType": {if((! attrsFound.hasOwnProperty("DatabaseTableName"))){var tableName = termOrVerb[(1)][(1)].replace(new RegExp(" ","g"),"_");for(var i = (2);(i < termOrVerb["length"]);i++){(tableName+=("-" + termOrVerb[i][(1)].replace(new RegExp(" ","g"),"_")))};attrs.push(["DatabaseTableName",tableName]);this.SetHelped()}else{undefined}if(this["foreignKeys"].hasOwnProperty(termOrVerb)){if((! attrsFound.hasOwnProperty("ForeignKey"))){attrs.push(["ForeignKey",this["foreignKeys"][termOrVerb]]);this.SetHelped()}else{if((attrsFound["ForeignKey"] != this["foreignKeys"][termOrVerb])){console.error(attrsFound["ForeignKey"],this["foreignKeys"][termOrVerb]);___MISMATCHED_FOREIGN_KEY___.die()}else{undefined}};if((! attrsFound.hasOwnProperty("DatabaseAttribute"))){attrs.push(["DatabaseAttribute",false]);this.SetHelped()}else{undefined}}else{undefined}if((termOrVerb["length"] == (3))){if(((! this["primitives"].hasOwnProperty(termOrVerb[(1)])) || (this["primitives"][termOrVerb[(1)]] !== false))){this.SetHelped()}else{undefined};(this["primitives"][termOrVerb[(1)]]=false)}else{if((termOrVerb["length"] > (4))){for(var i = (1);(i < termOrVerb["length"]);(i+=(2))){if(((! this["attributes"].hasOwnProperty(termOrVerb[i])) || (this["attributes"][termOrVerb[i]] !== false))){this.SetHelped()}else{undefined};(this["attributes"][termOrVerb[i]]=false)}}else{undefined}}break}};termOrVerb.push(attrs)}));return LF2AbstractSQLPrep}));
define('ometa!sbvr-compiler/LF2AbstractSQL',["ometa!sbvr-parser/SBVRLibs","ometa-core"],(function (SBVRLibs){var _ = require("underscore");var LF2AbstractSQL=SBVRLibs._extend({
"TermName":function(){var _fromIdx=this.input.idx,termName,$elf=this;termName=this._apply("anything");this._or((function(){return this._pred((! this["tables"].hasOwnProperty(this.GetResourceName(termName))))}),(function(){console.error(("We already have a term with a name of: " + termName));return this._pred(false)}));(this["terms"][termName]=termName);(this["tables"][this.GetResourceName(termName)]=({"fields": [],"primitive": false,"name": null,"idField": null}));return termName},
"Attributes":function(tableID){var _fromIdx=this.input.idx,attributeValue,attributeName,$elf=this;return this._or((function(){return this._apply("end")}),(function(){return this._form((function(){this._applyWithArgs("exactly","Attributes");return this._many((function(){return this._form((function(){attributeName=this._apply("anything");return attributeValue=this._applyWithArgs("ApplyFirstExisting",[("Attr" + attributeName),"DefaultAttr"],[tableID])}))}))}))}))},
"DefaultAttr":function(tableID){var _fromIdx=this.input.idx,anything,$elf=this;anything=this._apply("anything");return console.log("Default",tableID,anything)},
"AttrConceptType":function(termName){var _fromIdx=this.input.idx,field,conceptTable,conceptType,fieldID,primitive,termTable,$elf=this;this._form((function(){this._applyWithArgs("exactly","Term");return conceptType=this._apply("anything")}));(this["conceptTypes"][termName]=conceptType);primitive=this._applyWithArgs("IsPrimitive",conceptType);conceptTable=this["tables"][this.GetResourceName(conceptType)];termTable=this["tables"][this.GetResourceName(termName)];field=["ConceptType",conceptTable["name"],"NOT NULL",conceptTable["idField"]];this._opt((function(){this._pred(((primitive !== false) && (conceptType === primitive)));(field[(0)]=primitive);return this._or((function(){this._pred(termTable.hasOwnProperty("valueField"));fieldID=this._applyWithArgs("GetTableFieldID",termTable,termTable["valueField"]);this._pred((fieldID !== false));(field[(1)]=termTable["fields"][fieldID][(1)]);return termTable["fields"].splice(fieldID,(1))}),(function(){return (termTable["valueField"]=conceptTable["name"])}))}));return termTable["fields"].push(field)},
"AttrDatabaseIDField":function(tableID){var _fromIdx=this.input.idx,fieldID,idField,table,$elf=this;idField=this._apply("anything");table=this["tables"][this.GetResourceName(tableID)];return this._or((function(){return this._pred(_.isString(table))}),(function(){this._or((function(){fieldID=this._applyWithArgs("GetTableFieldID",table,idField);this._pred((fieldID !== false));(table["fields"][fieldID][(2)]="PRIMARY KEY");return this._opt((function(){this._pred((table["fields"][fieldID][(0)] == "Value"));return (table["fields"][fieldID][(0)]="Serial")}))}),(function(){return table["fields"].push(["Serial",idField,"PRIMARY KEY"])}));return (table["idField"]=idField)}))},
"AttrDatabaseValueField":function(tableID){var _fromIdx=this.input.idx,fieldID,valueField,table,$elf=this;valueField=this._apply("anything");table=this["tables"][this.GetResourceName(tableID)];return this._or((function(){return this._pred(_.isString(table))}),(function(){this._or((function(){this._pred(table.hasOwnProperty("valueField"));fieldID=this._applyWithArgs("GetTableFieldID",table,table["valueField"]);this._pred((fieldID !== false));return (table["fields"][fieldID][(1)]=valueField)}),(function(){fieldID=this._applyWithArgs("GetTableFieldID",table,valueField);return this._pred((fieldID !== false))}),(function(){return table["fields"].push(["Value",valueField,"NOT NULL"])}));return (table["valueField"]=valueField)}))},
"AttrDatabaseTableName":function(tableID){var tableName,_fromIdx=this.input.idx,table,$elf=this;tableName=this._apply("anything");table=this["tables"][this.GetResourceName(tableID)];return this._or((function(){return this._pred(_.isString(table))}),(function(){return (table["name"]=tableName)}))},
"AttrDatabasePrimitive":function(termName){var _fromIdx=this.input.idx,attrVal,$elf=this;attrVal=this._apply("anything");return (this["tables"][this.GetResourceName(termName)]["primitive"]=attrVal)},
"AttrDatabaseAttribute":function(factType){var _fromIdx=this.input.idx,attrVal,attributeTable,fieldID,baseTable,$elf=this;attrVal=this._apply("anything");return this._opt((function(){this._pred(attrVal);(this["attributes"][factType]=attrVal);(this["tables"][this.GetResourceName(factType)]="Attribute");baseTable=this["tables"][this.GetResourceName(factType[(0)][(1)])];attributeTable=this["tables"][this.GetResourceName(factType[(2)][(1)])];fieldID=this._applyWithArgs("GetTableFieldID",baseTable,attributeTable["name"]);return (baseTable["fields"][fieldID][(0)]=attributeTable["primitive"])}))},
"AttrForeignKey":function(factType){var fkField,_fromIdx=this.input.idx,fkTable,type,fieldID,baseTable,$elf=this;type=this._apply("anything");baseTable=this["tables"][this.GetResourceName(factType[(0)][(1)])];fkTable=this["tables"][this.GetResourceName(factType[(2)][(1)])];fkField=["ForeignKey",fkTable["name"],type,fkTable["idField"]];this._or((function(){this._pred(((baseTable["valueField"] == fkTable["name"]) || (baseTable["idField"] == fkTable["name"])));fieldID=this._applyWithArgs("GetTableFieldID",baseTable,fkTable["name"]);this._pred((fieldID !== false));return (baseTable["fields"][fieldID]=fkField)}),(function(){return baseTable["fields"].push(fkField)}));return (this["tables"][this.GetResourceName(factType)]="ForeignKey")},
"AttrSynonymousForm":function(factType){var synForm,_fromIdx=this.input.idx,$elf=this;synForm=this._apply("anything");return this._applyWithArgs("AddFactType",synForm,factType)},
"AttrTermForm":function(factType){var _fromIdx=this.input.idx,term,$elf=this;term=this._apply("anything");(this["terms"][term[(1)]]=factType);return (this["tables"][this.GetResourceName(term[(1)])]=this["tables"][this.GetResourceName(factType)])},
"FactType":function(){var _fromIdx=this.input.idx,resourceName,termName,fkTable,attributes,verb,factTypePart,factType,$elf=this;this._lookahead((function(){return factType=this._many1((function(){factTypePart=this._apply("anything");this._lookahead((function(){return attributes=this._apply("anything")}));return factTypePart}))}));this._applyWithArgs("AddFactType",factType,factType);resourceName=this.GetResourceName(factType);this._or((function(){this._pred((factType["length"] == (2)));this._many1((function(){factTypePart=this._apply("anything");return this._lookahead((function(){return attributes=this._apply("anything")}))}));this["tables"][this.GetResourceName(factType[(0)][(1)])]["fields"].push(["Boolean",factType[(1)][(1)]]);return (this["tables"][resourceName]="BooleanAttribute")}),(function(){(this["tables"][resourceName]=({"fields": [],"primitive": false,"name": null}));return this._many1((function(){return this._or((function(){this._form((function(){this._applyWithArgs("exactly","Term");return termName=this._apply("anything")}));fkTable=this["tables"][this.GetResourceName(termName)];return this["tables"][resourceName]["fields"].push(["ForeignKey",fkTable["name"],"NOT NULL",fkTable["idField"]])}),(function(){return this._form((function(){this._applyWithArgs("exactly","Verb");return verb=this._apply("anything")}))}))}))}));return factType},
"Cardinality":function(){var _fromIdx=this.input.idx,cardinality,$elf=this;this._form((function(){(function(){switch(this._apply('anything')){case "Cardinality":return "Cardinality";case "MinimumCardinality":return "MinimumCardinality";case "MaximumCardinality":return "MaximumCardinality";default: throw this._fail()}}).call(this);return cardinality=this._apply("Number")}));return cardinality},
"Number":function(){var _fromIdx=this.input.idx,num,$elf=this;this._form((function(){this._applyWithArgs("exactly","Number");num=this._apply("anything");return this._pred((! isNaN(num)))}));return num},
"Variable":function(){var _fromIdx=this.input.idx,termName,varAlias,query,whereBody,termNames,bind,baseTermName,$elf=this;this._form((function(){this._applyWithArgs("exactly","Variable");bind=this._apply("Number");this._form((function(){this._applyWithArgs("exactly","Term");return baseTermName=this._apply("anything")}));termNames=this._or((function(){termNames=this["bindTerms"][bind];this._pred(termNames);return termNames}),(function(){return [baseTermName]}));varAlias=("var" + bind);termName=termNames.shift();query=["SelectQuery",["Select",[]],["From",this["tables"][this.GetResourceName(termName)]["name"],(varAlias + termName)]];(function (){this.ResolveConceptTypes(query,termName,varAlias);if((termNames["length"] > (0))){var attributeName = this["tables"][this.GetResourceName(baseTermName)]["name"];for(var i = (0);(i < termNames["length"]);i++){var extraTermName = termNames[i],extraTable = this["tables"][this.GetResourceName(extraTermName)];query.push(["From",extraTable["name"],(varAlias + extraTermName)]);this.AddWhereClause(query,["Equals",["ReferencedField",(varAlias + termName),attributeName],["ReferencedField",(varAlias + extraTermName),attributeName]]);this.ResolveConceptTypes(query,extraTermName,varAlias)}}else{undefined}}).call(this);return this._opt((function(){whereBody=this._apply("RulePart");return this._applyWithArgs("AddWhereClause",query,whereBody)}))}));whereBody=this._apply("RulePart");this._applyWithArgs("AddWhereClause",query,whereBody);return query},
"RoleBinding":function(){var _fromIdx=this.input.idx,termName,bind,$elf=this;this._form((function(){this._applyWithArgs("exactly","RoleBinding");this._form((function(){this._applyWithArgs("exactly","Term");return termName=this._apply("anything")}));return bind=this._apply("anything")}));return [termName,bind]},
"LinkTable":function(actualFactType,rootTerms){var _fromIdx=this.input.idx,termName,resourceName,tableAlias,query,bind,i,$elf=this;tableAlias=("link" + this["linkTableBind"]++);query=["SelectQuery",["Select",[]],["From",this["tables"][this.GetResourceName(actualFactType)]["name"],tableAlias]];i=(0);this._many1((function(){this._pred((i < rootTerms["length"]));bind=this._apply("RoleBinding");termName=rootTerms[i];resourceName=this.GetResourceName(termName);this._applyWithArgs("AddWhereClause",query,["Equals",["ReferencedField",tableAlias,this["tables"][resourceName]["name"]],["ReferencedField",(("var" + bind[(1)]) + termName),this["tables"][resourceName]["idField"]]]);return i++}));return ["Exists",query]},
"ForeignKey":function(actualFactType,rootTerms){var _fromIdx=this.input.idx,bindTo,termFrom,bindFrom,termTo,temp,tableTo,$elf=this;this._pred((this["tables"][this.GetResourceName(actualFactType)] == "ForeignKey"));this._or((function(){bindFrom=this._apply("RoleBinding");bindTo=this._apply("RoleBinding");this._apply("end");this._or((function(){this._pred(this.IsChild(bindFrom[(0)],actualFactType[(0)]));termFrom=rootTerms[(0)];return termTo=rootTerms[(1)]}),(function(){temp=bindTo;bindTo=bindFrom;bindFrom=temp;termFrom=rootTerms[(1)];return termTo=rootTerms[(0)]}));return tableTo=this["tables"][this.GetResourceName(termTo)]}),(function(){return this._applyWithArgs("foreign",___ForeignKeyMatchingFailed___,'die')}));return ["Equals",["ReferencedField",(("var" + bindFrom[(1)]) + termFrom),tableTo["name"]],["ReferencedField",(("var" + bindTo[(1)]) + termTo),tableTo["idField"]]]},
"BooleanAttribute":function(actualFactType){var _fromIdx=this.input.idx,termFrom,bindFrom,attributeName,$elf=this;this._pred((this["tables"][this.GetResourceName(actualFactType)] == "BooleanAttribute"));this._or((function(){bindFrom=this._apply("RoleBinding");this._apply("end");termFrom=actualFactType[(0)][(1)];return attributeName=actualFactType[(1)][(1)]}),(function(){console.error(this["input"]);return this._applyWithArgs("foreign",___BooleanAttributeMatchingFailed___,'die')}));return ["Equals",["ReferencedField",(("var" + bindFrom[(1)]) + termFrom),attributeName],["Boolean",true]]},
"Attribute":function(actualFactType,rootTerms){var _fromIdx=this.input.idx,termNameAttr,termNameReal,bindReal,query,bindAttr,temp,resourceAttr,$elf=this;this._pred((this["tables"][this.GetResourceName(actualFactType)] == "Attribute"));query=["SelectQuery",["Select",[]]];this._or((function(){bindReal=this._apply("RoleBinding");bindAttr=this._apply("RoleBinding");this._apply("end");return this._or((function(){this._pred(this.IsChild(bindReal[(0)],actualFactType[(0)]));termNameReal=rootTerms[(0)];return termNameAttr=rootTerms[(1)]}),(function(){temp=bindAttr;bindAttr=bindReal;bindReal=temp;termNameReal=rootTerms[(1)];return termNameAttr=rootTerms[(0)]}))}),(function(){return this._applyWithArgs("foreign",___AttributeMatchingFailed___,'die')}));resourceAttr=this.GetResourceName(termNameAttr);this._applyWithArgs("AddWhereClause",query,["Equals",["ReferencedField",(("var" + bindAttr[(1)]) + termNameReal),this["tables"][resourceAttr]["name"]],["ReferencedField",(("var" + bindReal[(1)]) + termNameReal),this["tables"][resourceAttr]["name"]]]);return ["Exists",query]},
"AtomicFormulation":function(){var actualFactType,_fromIdx=this.input.idx,whereClause,factType,rootTerms,$elf=this;this._form((function(){this._applyWithArgs("exactly","AtomicFormulation");this._form((function(){this._applyWithArgs("exactly","FactType");return factType=this._many1((function(){return this._apply("anything")}))}));actualFactType=this._applyWithArgs("ActualFactType",factType);rootTerms=this._applyWithArgs("FactTypeRootTerms",factType,actualFactType);return whereClause=this._or((function(){return this._applyWithArgs("ForeignKey",actualFactType,rootTerms)}),(function(){return this._applyWithArgs("BooleanAttribute",actualFactType)}),(function(){return this._applyWithArgs("Attribute",actualFactType,rootTerms)}),(function(){return this._applyWithArgs("LinkTable",actualFactType,rootTerms)}))}));return whereClause},
"AtLeast":function(){var minCard,_fromIdx=this.input.idx,query,$elf=this;this._form((function(){this._applyWithArgs("exactly","AtLeastNQuantification");minCard=this._apply("Cardinality");query=this._apply("Variable");return query[(1)][(1)].push(["Count","*"])}));return ["GreaterThanOrEqual",query,["Number",minCard]]},
"Exactly":function(){var _fromIdx=this.input.idx,card,query,$elf=this;this._form((function(){this._applyWithArgs("exactly","ExactQuantification");card=this._apply("Cardinality");query=this._apply("Variable");return query[(1)][(1)].push(["Count","*"])}));return ["Equals",query,["Number",card]]},
"Range":function(){var minCard,_fromIdx=this.input.idx,maxCard,query,$elf=this;this._form((function(){this._applyWithArgs("exactly","NumericalRangeQuantification");minCard=this._apply("Cardinality");maxCard=this._apply("Cardinality");query=this._apply("Variable");return query[(1)][(1)].push(["Count","*"])}));return ["Between",query,["Number",minCard],["Number",maxCard]]},
"Exists":function(){var _fromIdx=this.input.idx,query,$elf=this;this._form((function(){this._applyWithArgs("exactly","ExistentialQuantification");return query=this._apply("Variable")}));return ["Exists",query]},
"Negation":function(){var _fromIdx=this.input.idx,whereBody,$elf=this;this._form((function(){this._applyWithArgs("exactly","LogicalNegation");return whereBody=this._apply("RulePart")}));return ["Not",whereBody]},
"RulePart":function(){var _fromIdx=this.input.idx,x,whereBody,$elf=this;whereBody=this._or((function(){return this._apply("AtomicFormulation")}),(function(){return this._apply("AtLeast")}),(function(){return this._apply("Exactly")}),(function(){return this._apply("Exists")}),(function(){return this._apply("Negation")}),(function(){return this._apply("Range")}),(function(){x=this._apply("anything");console.error("Hit unhandled operation:",x);return this._pred(false)}));return whereBody},
"RuleBody":function(){var _fromIdx=this.input.idx,rule,$elf=this;this._form((function(){(function(){switch(this._apply('anything')){case "PermissibilityFormulation":return "PermissibilityFormulation";case "PossibilityFormulation":return "PossibilityFormulation";case "ObligationFormulation":return "ObligationFormulation";case "NecessityFormulation":return "NecessityFormulation";default: throw this._fail()}}).call(this);return rule=this._apply("RulePart")}));return rule},
"ProcessAtomicFormulations":function(){var actualFactType,_fromIdx=this.input.idx,tableTerm,factType,bind,$elf=this;return this._many((function(){return this._or((function(){this._pred(_.isArray(this["input"]["lst"]));return this._form((function(){return this._or((function(){return (function(){switch(this._apply('anything')){case "AtomicFormulation":return (function(){this._form((function(){this._applyWithArgs("exactly","FactType");return factType=this._many1((function(){return this._apply("anything")}))}));actualFactType=this._applyWithArgs("ActualFactType",factType);this._pred((this["attributes"].hasOwnProperty(actualFactType) && this["attributes"][actualFactType]));tableTerm=null;(function (){for(var i = (0);(i < actualFactType["length"]);(i+=(2))){if((! this["tables"][this.GetResourceName(actualFactType[i][(1)])]["primitive"])){(tableTerm=actualFactType[i][(1)]);break}else{undefined}}}).call(this);return this._many((function(){bind=this._apply("RoleBinding");return this._opt((function(){this._pred(this["tables"][this.GetResourceName(bind[(0)])]["primitive"]);return (this["bindTerms"][bind[(1)]]=(this["bindTerms"][bind[(1)]] || [])).push(tableTerm)}))}))}).call(this);default: throw this._fail()}}).call(this)}),(function(){return this._apply("ProcessAtomicFormulations")}))}))}),(function(){return this._apply("anything")}))}))},
"Process":function(){var _fromIdx=this.input.idx,termName,ruleText,ruleBody,tables,factType,$elf=this;this._form((function(){this._applyWithArgs("exactly","Model");return this._many1((function(){return this._form((function(){return (function(){switch(this._apply('anything')){case "Rule":return (function(){(this["bindTerms"]=[]);this._lookahead((function(){return this._apply("ProcessAtomicFormulations")}));ruleBody=this._apply("RuleBody");this._form((function(){this._applyWithArgs("exactly","StructuredEnglish");return ruleText=this._apply("anything")}));(this["linkTableBind"]=(0));return this["rules"].push(["Rule",["StructuredEnglish",ruleText],["Body",ruleBody]])}).call(this);case "Term":return (function(){termName=this._apply("TermName");return this._applyWithArgs("Attributes",termName)}).call(this);case "FactType":return (function(){factType=this._apply("FactType");return this._applyWithArgs("Attributes",factType)}).call(this);default: throw this._fail()}}).call(this)}))}))}));tables=({});return ({"tables": this["tables"],"rules": this["rules"]})}});(LF2AbstractSQL["AddWhereClause"]=(function (query,whereBody){if(((whereBody[(0)] == "Exists") && ((((whereBody[(1)][(0)] == "SelectQuery") || (whereBody[(1)][(0)] == "InsertQuery")) || (whereBody[(1)][(0)] == "UpdateQuery")) || (whereBody[(1)][(0)] == "UpsertQuery")))){(whereBody=whereBody[(1)].slice((1)));for(var i = (0);(i < whereBody["length"]);i++){if((whereBody[i][(0)] == "From")){query.push(whereBody[i])}else{undefined}};for(var i = (0);(i < whereBody["length"]);i++){if((whereBody[i][(0)] == "Where")){this.AddWhereClause(query,whereBody[i][(1)])}else{undefined}}}else{for(var i = (1);(i < query["length"]);i++){if((query[i][(0)] == "Where")){(query[i][(1)]=["And",query[i][(1)],whereBody]);return undefined}else{undefined}};query.push(["Where",whereBody])}}));(LF2AbstractSQL["ResolveConceptTypes"]=(function (query,termName,varAlias){var conceptAlias,parentAlias = (varAlias + termName),conceptName = termName,conceptTable;while(this["conceptTypes"].hasOwnProperty(conceptName)){(conceptName=this["conceptTypes"][termName]);(conceptAlias=(varAlias + conceptName));(conceptTable=this["tables"][this.GetResourceName(conceptName)]);query.push(["From",conceptTable["name"],conceptAlias]);this.AddWhereClause(query,["Equals",["ReferencedField",parentAlias,conceptTable["name"]],["ReferencedField",conceptAlias,conceptTable["idField"]]]);(parentAlias=conceptAlias)}}));(LF2AbstractSQL["initialize"]=(function (){SBVRLibs["initialize"].call(this);(this["tables"]=({}));(this["terms"]=({}));(this["rules"]=[]);(this["linkTableBind"]=(0));(this["attributes"]=({}));(this["bindTerms"]=[])}));return LF2AbstractSQL}));
define('ometa!sbvr-compiler/AbstractSQLRules2SQL',["ometa-core"],(function (){var comparisons = ({"Equals": " = ","GreaterThan": " > ","GreaterThanOrEqual": " >= ","LessThan": " < ","LessThanOrEqual": " <= ","NotEquals": " != "});var AbstractSQLRules2SQL=OMeta._extend({
"NestedIndent":function(indent){var _fromIdx=this.input.idx,$elf=this;return (indent + "\t")},
"Not":function(indent){var _fromIdx=this.input.idx,ruleBody,notStatement,nestedIndent,$elf=this;this._form((function(){this._applyWithArgs("exactly","Not");return notStatement=this._or((function(){ruleBody=this._applyWithArgs("Exists",indent);return ("NOT " + ruleBody)}),(function(){nestedIndent=this._applyWithArgs("NestedIndent",indent);ruleBody=this._applyWithArgs("RuleBody",nestedIndent);return (((("NOT (" + nestedIndent) + ruleBody) + indent) + ")")}))}));return notStatement},
"Exists":function(indent){var _fromIdx=this.input.idx,ruleBody,nestedIndent,$elf=this;this._form((function(){this._applyWithArgs("exactly","Exists");nestedIndent=this._applyWithArgs("NestedIndent",indent);return ruleBody=this._applyWithArgs("SelectQuery",nestedIndent)}));return (((("EXISTS (" + nestedIndent) + ruleBody) + indent) + ")")},
"ProcessQuery":function(){var _fromIdx=this.input.idx,query,$elf=this;return this._or((function(){query=this._or((function(){return this._applyWithArgs("SelectQuery","\n")}),(function(){return this._applyWithArgs("InsertQuery","\n")}),(function(){return this._applyWithArgs("UpdateQuery","\n")}),(function(){return this._applyWithArgs("DeleteQuery","\n")}));return ({"query": query,"bindings": this["fieldOrderings"]})}),(function(){return this._applyWithArgs("UpsertQuery","\n")}))},
"SelectQuery":function(indent){var _fromIdx=this.input.idx,limit,orderBy,where,offset,tables,fields,table,nestedIndent,$elf=this;nestedIndent=this._applyWithArgs("NestedIndent",indent);tables=[];where="";orderBy="";limit="";offset="";this._form((function(){this._applyWithArgs("exactly","SelectQuery");return this._many((function(){return this._form((function(){return this._or((function(){return fields=this._apply("Select")}),(function(){table=this._apply("Table");return tables.push(table)}),(function(){where=this._applyWithArgs("Where",indent);return where=(indent + where)}),(function(){orderBy=this._applyWithArgs("OrderBy",indent);return orderBy=(indent + orderBy)}),(function(){limit=this._applyWithArgs("Limit",indent);return limit=(indent + limit)}),(function(){offset=this._applyWithArgs("Offset",indent);return offset=(indent + offset)}))}))}))}));return (((((((("SELECT " + fields.join(", ")) + indent) + "FROM ") + tables.join(("," + nestedIndent))) + where) + orderBy) + limit) + offset)},
"DeleteQuery":function(indent){var _fromIdx=this.input.idx,where,tables,table,$elf=this;tables=[];where="";this._form((function(){this._applyWithArgs("exactly","DeleteQuery");return this._many((function(){return this._form((function(){return this._or((function(){table=this._apply("Table");return tables.push(table)}),(function(){where=this._applyWithArgs("Where",indent);return where=(indent + where)}))}))}))}));return (("DELETE FROM " + tables.join(", ")) + where)},
"InsertBody":function(indent){var fieldValues,_fromIdx=this.input.idx,tables,table,$elf=this;tables=[];this._many((function(){return this._form((function(){return this._or((function(){return fieldValues=this._apply("Fields")}),(function(){table=this._apply("Table");return tables.push(table)}),(function(){return (function(){switch(this._apply('anything')){case "Where":return this._many((function(){return this._apply("anything")}));default: throw this._fail()}}).call(this)}))}))}));return this._or((function(){this._pred((fieldValues[(0)]["length"] > (0)));return (((((((("INSERT INTO " + tables.join(", ")) + " (") + fieldValues[(0)].join(", ")) + ")") + indent) + " VALUES (") + fieldValues[(1)].join(", ")) + ")")}),(function(){return (("INSERT INTO " + tables.join(", ")) + " DEFAULT VALUES")}))},
"UpdateBody":function(indent){var fieldValues,_fromIdx=this.input.idx,where,tables,table,sets,$elf=this;tables=[];where="";this._many((function(){return this._form((function(){return this._or((function(){return fieldValues=this._apply("Fields")}),(function(){table=this._apply("Table");return tables.push(table)}),(function(){where=this._applyWithArgs("Where",indent);return where=(indent + where)}))}))}));this._or((function(){return this._pred((fieldValues[(0)]["length"] > (0)))}),(function(){return this._applyWithArgs("foreign",___UPDATE_QUERY_WITH_NO_FIELDS___,'die')}));sets=[];(function (){for(var i = (0);(i < fieldValues[(0)]["length"]);i++){(sets[i]=((fieldValues[(0)][i] + " = ") + fieldValues[(1)][i]))}}).call(this);return ((((("UPDATE " + tables.join(", ")) + indent) + " SET ") + sets.join(("," + indent))) + where)},
"UpsertQuery":function(indent){var insert,_fromIdx=this.input.idx,update,tables,$elf=this;tables=[];this._form((function(){this._applyWithArgs("exactly","UpsertQuery");insert=this._lookahead((function(){return this._applyWithArgs("InsertBody",indent)}));insert=({"query": insert,"bindings": this["fieldOrderings"]});(this["fieldOrderings"]=[]);update=this._applyWithArgs("UpdateBody",indent);return update=({"query": update,"bindings": this["fieldOrderings"]})}));return [insert,update]},
"InsertQuery":function(indent){var insert,_fromIdx=this.input.idx,$elf=this;this._form((function(){this._applyWithArgs("exactly","InsertQuery");return insert=this._applyWithArgs("InsertBody",indent)}));return insert},
"UpdateQuery":function(indent){var _fromIdx=this.input.idx,update,$elf=this;this._form((function(){this._applyWithArgs("exactly","UpdateQuery");return update=this._applyWithArgs("UpdateBody",indent)}));return update},
"Null":function(){var next,_fromIdx=this.input.idx,$elf=this;next=this._apply("anything");this._pred((next === null));return null},
"Fields":function(){var _fromIdx=this.input.idx,field,value,values,fields,$elf=this;this._applyWithArgs("exactly","Fields");fields=[];values=[];this._form((function(){return this._many((function(){return this._form((function(){field=this._apply("anything");fields.push((("\"" + field) + "\""));value=this._or((function(){return (function(){switch(this._apply('anything')){case "?":return "?";default: throw this._fail()}}).call(this)}),(function(){this._apply("true");return (1)}),(function(){this._apply("false");return (0)}),(function(){this._apply("Null");return "NULL"}),(function(){return this._apply("Bind")}),(function(){value=this._apply("anything");return (("'" + value) + "'")}));return values.push(value)}))}))}));return [fields,values]},
"Select":function(){var _fromIdx=this.input.idx,field,fields,as,$elf=this;this._applyWithArgs("exactly","Select");fields=[];this._form((function(){return this._or((function(){this._apply("end");return fields.push("1")}),(function(){return this._many((function(){return this._or((function(){return this._form((function(){field=this._or((function(){return (function(){switch(this._apply('anything')){case "Count":return (function(){this._applyWithArgs("exactly","*");return "COUNT(*)"}).call(this);default: throw this._fail()}}).call(this)}),(function(){field=this._or((function(){return this._apply("Field")}),(function(){return this._apply("ReferencedField")}));as=this._apply("anything");return (((field + " AS \"") + as) + "\"")}));return fields.push(field)}))}),(function(){return (function(){switch(this._apply('anything')){case "*":return fields.push("*");default: throw this._fail()}}).call(this)}),(function(){this._apply("Null");return fields.push("NULL")}),(function(){field=this._apply("anything");return fields.push((("\"" + field) + "\""))}))}))}))}));return fields},
"Table":function(){var _fromIdx=this.input.idx,table,alias,$elf=this;this._applyWithArgs("exactly","From");table=this._apply("anything");alias=[];this._opt((function(){alias=this._apply("anything");return alias=[(("\"" + alias) + "\"")]}));return [(("\"" + table) + "\"")].concat(alias).join(" AS ")},
"Where":function(indent){var _fromIdx=this.input.idx,ruleBody,$elf=this;this._applyWithArgs("exactly","Where");ruleBody=this._applyWithArgs("RuleBody",indent);return ("WHERE " + ruleBody)},
"OrderBy":function(indent){var _fromIdx=this.input.idx,field,orders,order,$elf=this;this._applyWithArgs("exactly","OrderBy");orders=[];this._many1((function(){return this._form((function(){order=(function(){switch(this._apply('anything')){case "DESC":return "DESC";case "ASC":return "ASC";default: throw this._fail()}}).call(this);field=this._or((function(){return this._apply("Field")}),(function(){return this._apply("ReferencedField")}));return orders.push(((field + " ") + order))}))}));return ("ORDER BY " + orders.join(", "))},
"Limit":function(indent){var _fromIdx=this.input.idx,num,$elf=this;this._applyWithArgs("exactly","Limit");num=this._apply("Number");return ("LIMIT " + num)},
"Offset":function(indent){var _fromIdx=this.input.idx,num,$elf=this;this._applyWithArgs("exactly","Offset");num=this._apply("Number");return ("OFFSET " + num)},
"Field":function(){var _fromIdx=this.input.idx,field,$elf=this;this._form((function(){this._applyWithArgs("exactly","Field");return field=this._apply("anything")}));return (("\"" + field) + "\"")},
"ReferencedField":function(){var _fromIdx=this.input.idx,field,binding,$elf=this;this._form((function(){this._applyWithArgs("exactly","ReferencedField");binding=this._apply("anything");return field=this._apply("anything")}));return (((("\"" + binding) + "\".\"") + field) + "\"")},
"Number":function(){var _fromIdx=this.input.idx,number,$elf=this;this._form((function(){this._applyWithArgs("exactly","Number");return number=this._apply("anything")}));return number},
"Boolean":function(){var _fromIdx=this.input.idx,bool,$elf=this;this._form((function(){this._applyWithArgs("exactly","Boolean");return bool=this._or((function(){this._apply("true");return (1)}),(function(){this._apply("false");return (2)}))}));return bool},
"Bind":function(){var tableName,_fromIdx=this.input.idx,field,$elf=this;this._form((function(){this._applyWithArgs("exactly","Bind");tableName=this._apply("anything");return field=this._apply("anything")}));this["fieldOrderings"].push([tableName,field]);return "?"},
"Value":function(){var _fromIdx=this.input.idx,value,$elf=this;this._form((function(){this._applyWithArgs("exactly","Value");return value=this._apply("anything")}));return (("'" + value) + "'")},
"And":function(indent){var _fromIdx=this.input.idx,ruleBodies,$elf=this;this._form((function(){this._applyWithArgs("exactly","And");return ruleBodies=this._many((function(){return this._applyWithArgs("RuleBody",indent)}))}));return ruleBodies.join(" AND ")},
"Comparison":function(indent){var b,_fromIdx=this.input.idx,a,comparison,$elf=this;this._form((function(){comparison=(function(){switch(this._apply('anything')){case "Equals":return "Equals";case "LessThanOrEqual":return "LessThanOrEqual";case "GreaterThanOrEqual":return "GreaterThanOrEqual";case "NotEquals":return "NotEquals";case "LessThan":return "LessThan";case "GreaterThan":return "GreaterThan";default: throw this._fail()}}).call(this);a=this._applyWithArgs("RuleBody",indent);return b=this._applyWithArgs("RuleBody",indent)}));return ((a + comparisons[comparison]) + b)},
"Between":function(indent){var val,b,_fromIdx=this.input.idx,a,$elf=this;this._form((function(){this._applyWithArgs("exactly","Between");val=this._applyWithArgs("Comparator",indent);a=this._applyWithArgs("Comparator",indent);return b=this._applyWithArgs("Comparator",indent)}));return ((((val + " BETWEEN ") + a) + " AND ") + b)},
"Comparator":function(indent){var _fromIdx=this.input.idx,query,nestedIndent,$elf=this;return this._or((function(){nestedIndent=this._applyWithArgs("NestedIndent",indent);query=this._applyWithArgs("SelectQuery",nestedIndent);return (((("(" + nestedIndent) + query) + indent) + ")")}),(function(){return this._apply("Field")}),(function(){return this._apply("ReferencedField")}),(function(){return this._apply("Number")}),(function(){return this._apply("Boolean")}),(function(){return this._apply("Value")}),(function(){return this._apply("Bind")}))},
"RuleBody":function(indent){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){return this._applyWithArgs("Comparator",indent)}),(function(){return this._applyWithArgs("Not",indent)}),(function(){return this._applyWithArgs("Exists",indent)}),(function(){return this._applyWithArgs("Comparison",indent)}),(function(){return this._applyWithArgs("Between",indent)}),(function(){return this._applyWithArgs("And",indent)}))},
"Process":function(){var _fromIdx=this.input.idx,ruleBody,$elf=this;ruleBody=this._applyWithArgs("RuleBody","\n");return (("SELECT " + ruleBody) + " AS \"result\";")}});(AbstractSQLRules2SQL["initialize"]=(function (){(this["fieldOrderings"]=[])}));return AbstractSQLRules2SQL}));
define('ometa!Prettify',["ometa-core"],(function (){var Prettify=OMeta._extend({
"Elem":function(indent){var s,_fromIdx=this.input.idx,e,$elf=this;this._form((function(){return e=this._many((function(){return this._or((function(){s=this._apply("string");return (("\"" + s) + "\"")}),(function(){return this._applyWithArgs("Elem",(indent + "\t"))}),(function(){return this._apply("number")}),(function(){return this._apply("true")}),(function(){return this._apply("false")}))}))}));return (("[" + e.join((",\n" + indent))) + "]")},
"Process":function(){var _fromIdx=this.input.idx,$elf=this;return this._applyWithArgs("Elem","\t")}});return Prettify}));
define('ometa!sbvr-compiler/AbstractSQLOptimiser',["ometa!Prettify","underscore","ometa-core"],(function (Prettify){var AbstractSQLValidator=OMeta._extend({
"Query":function(){var _fromIdx=this.input.idx,$elf=this;return this._apply("SelectQuery")},
"SelectQuery":function(){var from,_fromIdx=this.input.idx,queryPart,where,query,select,$elf=this;query=["SelectQuery"];this._form((function(){this._applyWithArgs("exactly","SelectQuery");this._many1((function(){queryPart=this._or((function(){this._pred((select == null));return select=this._apply("Select")}),(function(){return from=this._apply("From")}),(function(){return this._apply("Join")}),(function(){this._pred((where == null));return where=this._apply("Where")}));return query=query.concat(queryPart)}));this._pred((select != null));return this._pred((from != null))}));return query},
"Select":function(){var _fromIdx=this.input.idx,fields,$elf=this;this._form((function(){this._applyWithArgs("exactly","Select");return this._form((function(){return fields=this._many((function(){return this._apply("Count")}))}))}));return [["Select",fields]]},
"Count":function(){var _fromIdx=this.input.idx,$elf=this;return this._form((function(){this._applyWithArgs("exactly","Count");return this._applyWithArgs("exactly","*")}))},
"From":function(){var from,_fromIdx=this.input.idx,as,table,$elf=this;this._form((function(){this._applyWithArgs("exactly","From");table=this._apply("anything");from=["From",table];return this._opt((function(){as=this._apply("anything");return from.push(as)}))}));return [from]},
"Join":function(){var _fromIdx=this.input.idx,boolStatement,table,$elf=this;this._form((function(){this._applyWithArgs("exactly","Join");this._form((function(){this._applyWithArgs("exactly","With");return table=this._apply("anything")}));return this._form((function(){this._applyWithArgs("exactly","On");return boolStatement=this._apply("BooleanStatement")}))}));return [["Join",["With",table],["On",boolStatement]]]},
"BooleanStatement":function(){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){return this._apply("Not")}),(function(){return this._apply("And")}),(function(){return this._apply("Exists")}),(function(){return this._apply("Equals")}),(function(){return this._apply("GreaterThan")}),(function(){return this._apply("GreaterThanOrEqual")}),(function(){return this._apply("LessThan")}),(function(){return this._apply("LessThanOrEqual")}),(function(){return this._apply("Between")}))},
"Where":function(){var _fromIdx=this.input.idx,boolStatement,$elf=this;this._form((function(){this._applyWithArgs("exactly","Where");return boolStatement=this._apply("BooleanStatement")}));return [["Where",boolStatement]]},
"Not":function(){var _fromIdx=this.input.idx,boolStatement,$elf=this;this._form((function(){this._applyWithArgs("exactly","Not");return boolStatement=this._apply("BooleanStatement")}));return ["Not",boolStatement]},
"And":function(){var _fromIdx=this.input.idx,boolStatement1,boolStatement2,$elf=this;this._form((function(){this._applyWithArgs("exactly","And");boolStatement1=this._apply("BooleanStatement");return boolStatement2=this._many1((function(){return this._apply("BooleanStatement")}))}));return ["And",boolStatement1].concat(boolStatement2)},
"Exists":function(){var _fromIdx=this.input.idx,query,$elf=this;this._form((function(){this._applyWithArgs("exactly","Exists");return query=this._apply("Query")}));return ["Exists",query]},
"NotEquals":function(){var _fromIdx=this.input.idx,comp1,comp2,$elf=this;this._form((function(){this._applyWithArgs("exactly","NotEquals");comp1=this._apply("Comparator");return comp2=this._apply("Comparator")}));return ["NotEquals",comp1,comp2]},
"Equals":function(){var _fromIdx=this.input.idx,comp1,comp2,$elf=this;this._form((function(){this._applyWithArgs("exactly","Equals");comp1=this._apply("Comparator");return comp2=this._apply("Comparator")}));return ["Equals",comp1,comp2]},
"GreaterThan":function(){var _fromIdx=this.input.idx,comp1,comp2,$elf=this;this._form((function(){this._applyWithArgs("exactly","GreaterThan");comp1=this._apply("Comparator");return comp2=this._apply("Comparator")}));return ["GreaterThan",comp1,comp2]},
"GreaterThanOrEqual":function(){var _fromIdx=this.input.idx,comp1,comp2,$elf=this;this._form((function(){this._applyWithArgs("exactly","GreaterThanOrEqual");comp1=this._apply("Comparator");return comp2=this._apply("Comparator")}));return ["GreaterThanOrEqual",comp1,comp2]},
"LessThan":function(){var _fromIdx=this.input.idx,comp1,comp2,$elf=this;this._form((function(){this._applyWithArgs("exactly","LessThan");comp1=this._apply("Comparator");return comp2=this._apply("Comparator")}));return ["LessThan",comp1,comp2]},
"LessThanOrEqual":function(){var _fromIdx=this.input.idx,comp1,comp2,$elf=this;this._form((function(){this._applyWithArgs("exactly","LessThanOrEqual");comp1=this._apply("Comparator");return comp2=this._apply("Comparator")}));return ["LessThanOrEqual",comp1,comp2]},
"Between":function(){var _fromIdx=this.input.idx,comp3,comp1,comp2,$elf=this;this._form((function(){this._applyWithArgs("exactly","Between");comp1=this._apply("Comparator");comp2=this._apply("Comparator");return comp3=this._apply("Comparator")}));return ["Between",comp1,comp2,comp3]},
"Comparator":function(){var _fromIdx=this.input.idx,$elf=this;return this._or((function(){return this._apply("Query")}),(function(){return this._apply("Field")}),(function(){return this._apply("ReferencedField")}),(function(){return this._apply("Number")}),(function(){return this._apply("Boolean")}))},
"Field":function(){var _fromIdx=this.input.idx,field,table,$elf=this;this._form((function(){this._applyWithArgs("exactly","Field");table=this._apply("anything");return field=this._apply("anything")}));return ["Field",table,field]},
"ReferencedField":function(){var _fromIdx=this.input.idx,field,binding,$elf=this;this._form((function(){this._applyWithArgs("exactly","ReferencedField");binding=this._apply("anything");return field=this._apply("anything")}));return ["ReferencedField",binding,field]},
"Number":function(){var _fromIdx=this.input.idx,number,$elf=this;this._form((function(){this._applyWithArgs("exactly","Number");return number=this._apply("anything")}));return ["Number",number]},
"Boolean":function(){var _fromIdx=this.input.idx,bool,$elf=this;this._form((function(){this._applyWithArgs("exactly","Boolean");return bool=this._or((function(){return this._apply("true")}),(function(){return this._apply("false")}))}));return ["Boolean",bool]}});var AbstractSQLOptimiser=AbstractSQLValidator._extend({
"Not":function(){var _fromIdx=this.input.idx,boolStatement,$elf=this;return this._or((function(){this._form((function(){this._applyWithArgs("exactly","Not");return this._or((function(){return this._form((function(){this._applyWithArgs("exactly","Not");return boolStatement=this._apply("BooleanStatement")}))}),(function(){boolStatement=this._apply("Equals");return (boolStatement[(0)]="NotEquals")}))}));this._apply("SetHelped");return boolStatement}),(function(){return this._form((function(){this._applyWithArgs("exactly","Exists");return this._form((function(){return this._applyWithArgs("exactly","SelectQuery")}))}))}),(function(){return AbstractSQLValidator._superApplyWithArgs(this,'Not')}))},
"Helped":function(){var _fromIdx=this.input.idx,$elf=this;this._pred((this["helped"] === true));return (this["helped"]=false)},
"SetHelped":function(){var _fromIdx=this.input.idx,$elf=this;return (this["helped"]=true)},
"Process":function(){var _fromIdx=this.input.idx,boolStatement,$elf=this;boolStatement=this._apply("anything");boolStatement=this._applyWithArgs("BooleanStatement",boolStatement);this._many((function(){this._applyWithArgs("Helped","disableMemoisation");return boolStatement=this._applyWithArgs("BooleanStatement",boolStatement)}));return boolStatement}});(AbstractSQLOptimiser["initialize"]=(function (){(this["helped"]=false)}));return AbstractSQLOptimiser}));
(function() {
  var __hasProp = {}.hasOwnProperty;

  define('cs!sbvr-compiler/AbstractSQL2SQL',['ometa!sbvr-compiler/AbstractSQLRules2SQL', 'ometa!sbvr-compiler/AbstractSQLOptimiser', 'ometa!Prettify'], function(AbstractSQLRules2SQL, AbstractSQLOptimiser, Prettify) {
    var dataTypeValidate, generate, mysqlDataType, postgresDataType, websqlDataType, _;
    _ = require('underscore');
    dataTypeValidate = function(originalValue, field) {
      var bcrypt, salt, validated, value;
      value = originalValue;
      validated = true;
      if (value === null || value === '') {
        switch (field[2]) {
          case 'PRIMARY KEY':
          case 'NOT NULL':
            validated = 'cannot be null';
        }
      } else {
        switch (field[0]) {
          case 'Serial':
          case 'Integer':
          case 'ForeignKey':
          case 'ConceptType':
            value = parseInt(value, 10);
            if (_.isNaN(value)) {
              validated = 'is not a number: ' + originalValue;
            }
            break;
          case 'Date':
          case 'Date Time':
          case 'Time':
            value = new Date(value);
            if (_.isNaN(value)) {
              validated = 'is not a ' + field[0] + ': ' + originalValue;
            }
            break;
          case 'Interval':
            value = parseInt(value, 10);
            if (_.isNaN(value)) {
              validated = 'is not a number: ' + originalValue;
            }
            break;
          case 'Real':
            value = parseFloat(value);
            if (_.isNaN(value)) {
              validated = 'is not a number: ' + originalValue;
            }
            break;
          case 'Short Text':
            if (!_.isString(value)) {
              validated = 'is not a string: ' + originalValue;
            } else if (value.length > 255) {
              validated = 'longer than 255 characters (' + value.length + ')';
            }
            break;
          case 'Long Text':
            if (!_.isString(value)) {
              validated = 'is not a string: ' + originalValue;
            }
            break;
          case 'JSON':
            try {
              value = JSON.stringify(value);
            } catch (e) {
              validated = 'cannot be turned into JSON: ' + originalValue;
            }
            break;
          case 'Boolean':
            value = Number(value);
            if (_.isNaN(value) || (value !== 0 && value !== 1)) {
              validated = 'is not a boolean: ' + originalValue;
            }
            break;
          case 'Hashed':
            if (!_.isString(value)) {
              validated = 'is not a string';
            } else if ((typeof window !== "undefined" && window !== null) && window === (function() {
              return this;
            })()) {
              if (value.length > 60) {
                validated = 'longer than 60 characters (' + value.length + ')';
              }
            } else {
              bcrypt = require('bcrypt');
              salt = bcrypt.genSaltSync();
              value = bcrypt.hashSync(value, salt);
            }
            break;
          default:
            if (!_.isString(value)) {
              validated = 'is not a string: ' + originalValue;
            } else if (value.length > 100) {
              validated = 'longer than 100 characters (' + value.length + ')';
            }
        }
      }
      return {
        validated: validated,
        value: value
      };
    };
    postgresDataType = function(dataType, necessity) {
      switch (dataType) {
        case 'Serial':
          return 'SERIAL ' + necessity;
        case 'Date':
          return 'DATE ' + necessity;
        case 'Date Time':
          return 'TIMESTAMP ' + necessity;
        case 'Time':
          return 'TIME ' + necessity;
        case 'Interval':
          return 'INTERVAL ' + necessity;
        case 'Real':
          return 'REAL ' + necessity;
        case 'Integer':
        case 'ForeignKey':
        case 'ConceptType':
          return 'INTEGER ' + necessity;
        case 'Short Text':
          return 'VARCHAR(255) ' + necessity;
        case 'Long Text':
        case 'JSON':
          return 'TEXT ' + necessity;
        case 'Boolean':
          return 'INTEGER NOT NULL DEFAULT 0';
        case 'Hashed':
          return 'CHAR(60) ' + necessity;
        case 'Value':
          return 'VARCHAR(100) NOT NULL';
        default:
          return 'VARCHAR(100)';
      }
    };
    mysqlDataType = function(dataType, necessity) {
      switch (dataType) {
        case 'Serial':
          return 'INTEGER ' + necessity + ' AUTO_INCREMENT';
        case 'Date':
          return 'DATE ' + necessity;
        case 'Date Time':
          return 'TIMESTAMP ' + necessity;
        case 'Time':
          return 'TIME ' + necessity;
        case 'Interval':
          return 'INTEGER ' + necessity;
        case 'Real':
          return 'REAL ' + necessity;
        case 'Integer':
        case 'ForeignKey':
        case 'ConceptType':
          return 'INTEGER ' + necessity;
        case 'Short Text':
          return 'VARCHAR(255) ' + necessity;
        case 'Long Text':
        case 'JSON':
          return 'TEXT ' + necessity;
        case 'Boolean':
          return 'INTEGER NOT NULL DEFAULT 0';
        case 'Hashed':
          return 'CHAR(60) ' + necessity;
        case 'Value':
          return 'VARCHAR(100) NOT NULL';
        default:
          return 'VARCHAR(100)';
      }
    };
    websqlDataType = function(dataType, necessity) {
      switch (dataType) {
        case 'Serial':
          return 'INTEGER ' + necessity + ' AUTOINCREMENT';
        case 'Date':
          return 'TEXT ' + necessity;
        case 'Date Time':
          return 'TEXT ' + necessity;
        case 'Time':
          return 'TEXT ' + necessity;
        case 'Interval':
          return 'INTEGER ' + necessity;
        case 'Real':
          return 'REAL ' + necessity;
        case 'Integer':
        case 'ForeignKey':
        case 'ConceptType':
          return 'INTEGER ' + necessity;
        case 'Short Text':
          return 'VARCHAR(255) ' + necessity;
        case 'Long Text':
        case 'JSON':
          return 'TEXT ' + necessity;
        case 'Boolean':
          return 'INTEGER NOT NULL DEFAULT 0';
        case 'Hashed':
          return 'CHAR(60) ' + necessity;
        case 'Value':
          return 'VARCHAR(100) ' + necessity;
        default:
          return 'VARCHAR(100)';
      }
    };
    generate = function(sqlModel, dataTypeGen, ifNotExists) {
      var createSQL, createSchemaStatements, dependency, depends, dropSQL, dropSchemaStatements, field, foreignKey, foreignKeys, hasDependants, instance, resourceName, rule, ruleSQL, ruleStatements, schemaDependencyMap, schemaInfo, table, tableName, tableNames, unsolvedDependency, _i, _j, _k, _l, _len, _len1, _len2, _len3, _len4, _len5, _m, _n, _ref, _ref1, _ref2, _ref3, _ref4, _ref5;
      ifNotExists = ifNotExists ? 'IF NOT EXISTS ' : '';
      hasDependants = {};
      schemaDependencyMap = {};
      _ref = sqlModel.tables;
      for (resourceName in _ref) {
        if (!__hasProp.call(_ref, resourceName)) continue;
        table = _ref[resourceName];
        if (!(!_.isString(table))) {
          continue;
        }
        foreignKeys = [];
        depends = [];
        dropSQL = 'DROP TABLE "' + table.name + '";';
        createSQL = 'CREATE TABLE ' + ifNotExists + '"' + table.name + '" (\n\t';
        _ref1 = table.fields;
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          field = _ref1[_i];
          createSQL += '"' + field[1] + '" ' + dataTypeGen(field[0], field[2]) + '\n,\t';
          if ((_ref2 = field[0]) === 'ForeignKey' || _ref2 === 'ConceptType') {
            foreignKeys.push([field[1], field[3]]);
            depends.push(field[1]);
            hasDependants[field[1]] = true;
          }
        }
        for (_j = 0, _len1 = foreignKeys.length; _j < _len1; _j++) {
          foreignKey = foreignKeys[_j];
          createSQL += 'FOREIGN KEY ("' + foreignKey[0] + '") REFERENCES "' + foreignKey[0] + '" ("' + foreignKey[1] + '")' + '\n,\t';
        }
        createSQL = createSQL.slice(0, -2) + ');';
        schemaDependencyMap[table.name] = {
          resourceName: resourceName,
          primitive: table.primitive,
          createSQL: createSQL,
          dropSQL: dropSQL,
          depends: depends
        };
      }
      createSchemaStatements = [];
      dropSchemaStatements = [];
      tableNames = [];
      while (tableNames.length !== (tableNames = Object.keys(schemaDependencyMap)).length && tableNames.length > 0) {
        for (_k = 0, _len2 = tableNames.length; _k < _len2; _k++) {
          tableName = tableNames[_k];
          schemaInfo = schemaDependencyMap[tableName];
          unsolvedDependency = false;
          _ref3 = schemaInfo.depends;
          for (_l = 0, _len3 = _ref3.length; _l < _len3; _l++) {
            dependency = _ref3[_l];
            if (schemaDependencyMap.hasOwnProperty(dependency)) {
              unsolvedDependency = true;
              break;
            }
          }
          if (unsolvedDependency === false) {
            if (sqlModel.tables[schemaInfo.resourceName].exists = schemaInfo.primitive === false || (hasDependants[tableName] != null)) {
              if (schemaInfo.primitive !== false) {
                console.warn("We're adding a primitive table??", schemaInfo.resourceName);
              }
              createSchemaStatements.push(schemaInfo.createSQL);
              dropSchemaStatements.push(schemaInfo.dropSQL);
              console.log(schemaInfo.createSQL);
            }
            delete schemaDependencyMap[tableName];
          }
        }
      }
      dropSchemaStatements = dropSchemaStatements.reverse();
      try {
        _ref4 = sqlModel.rules;
        for (_m = 0, _len4 = _ref4.length; _m < _len4; _m++) {
          rule = _ref4[_m];
          instance = AbstractSQLOptimiser.createInstance();
          rule[2][1] = instance.match(rule[2][1], 'Process');
        }
      } catch (e) {
        console.log(e);
        console.log(instance.input);
      }
      ruleStatements = [];
      try {
        _ref5 = sqlModel.rules;
        for (_n = 0, _len5 = _ref5.length; _n < _len5; _n++) {
          rule = _ref5[_n];
          instance = AbstractSQLRules2SQL.createInstance();
          ruleSQL = instance.match(rule[2][1], 'Process');
          console.log(rule[1][1]);
          console.log(ruleSQL);
          ruleStatements.push({
            structuredEnglish: rule[1][1],
            sql: ruleSQL
          });
        }
      } catch (e) {
        console.log(e);
        console.log(instance.input);
      }
      return {
        tables: sqlModel.tables,
        createSchema: createSchemaStatements,
        dropSchema: dropSchemaStatements,
        rules: ruleStatements
      };
    };
    return {
      websql: {
        generate: function(sqlModel) {
          return generate(sqlModel, websqlDataType, false);
        },
        dataTypeValidate: dataTypeValidate
      },
      postgres: {
        generate: function(sqlModel) {
          return generate(sqlModel, postgresDataType, true);
        },
        dataTypeValidate: dataTypeValidate
      },
      mysql: {
        generate: function(sqlModel) {
          return generate(sqlModel, mysqlDataType, true);
        },
        dataTypeValidate: dataTypeValidate
      }
    };
  });

}).call(this);

(function() {

  define('cs!sbvr-compiler/AbstractSQL2CLF',['underscore'],function() {
    var getField, _;
    _ = require('underscore');
    getField = function(table, fieldName) {
      var tableField, tableFields, _i, _len;
      tableFields = table.fields;
      for (_i = 0, _len = tableFields.length; _i < _len; _i++) {
        tableField = tableFields[_i];
        if (tableField[1] === fieldName) {
          return tableField;
        }
      }
      return false;
    };
    return function(sqlModel) {
      var addMapping, idParts, part, resourceField, resourceName, resourceToSQLMappings, resources, sqlField, sqlFieldName, sqlTable, sqlTableName, table, tables, _i, _len, _ref;
      tables = sqlModel.tables;
      resources = {};
      resourceToSQLMappings = {};
      /**
      		*	resourceToSQLMappings =
      		*		[resourceName][resourceField] = [sqlTableName, sqlFieldName]
      */

      addMapping = function(resourceName, resourceField, sqlTableName, sqlFieldName) {
        return resourceToSQLMappings[resourceName][resourceField] = [sqlTableName, sqlFieldName];
      };
      for (resourceName in tables) {
        table = tables[resourceName];
        if (!(table.exists !== false)) {
          continue;
        }
        idParts = resourceName.split('-');
        resourceToSQLMappings[resourceName] = {};
        if (_.isString(table)) {
          sqlTable = tables[idParts[0]];
          sqlFieldName = sqlTable.idField;
          resourceField = sqlTableName = sqlTable.name;
          addMapping(resourceName, resourceField, sqlTableName, sqlFieldName);
          resources[resourceName] = {
            resourceName: resourceName,
            modelName: ((function() {
              var _i, _len, _results;
              _results = [];
              for (_i = 0, _len = idParts.length; _i < _len; _i++) {
                part = idParts[_i];
                _results.push(part.replace(/_/g, ' '));
              }
              return _results;
            })()).join(' '),
            topLevel: idParts.length === 1,
            fields: [['ForeignKey', resourceField, 'NOT NULL', sqlFieldName]],
            idField: resourceField,
            valueField: resourceField,
            actions: ['view', 'add', 'delete']
          };
          switch (table) {
            case 'Attribute':
            case 'ForeignKey':
              resourceField = sqlFieldName = tables[idParts[2]].name;
              sqlTableName = sqlTable.name;
              addMapping(resourceName, resourceField, sqlTableName, sqlFieldName);
              resources[resourceName].fields.push(getField(sqlTable, sqlFieldName));
              resources[resourceName].valueField = resourceField;
              break;
            case 'BooleanAttribute':
              resourceField = sqlFieldName = idParts[1].replace(/_/g, ' ');
              sqlTableName = sqlTable.name;
              addMapping(resourceName, resourceField, sqlTableName, sqlFieldName);
              resources[resourceName].fields.push(getField(sqlTable, sqlFieldName));
              resources[resourceName].valueField = resourceField;
              break;
            default:
              throw 'Unrecognised table type';
          }
        } else {
          resources[resourceName] = {
            resourceName: resourceName,
            modelName: ((function() {
              var _i, _len, _results;
              _results = [];
              for (_i = 0, _len = idParts.length; _i < _len; _i++) {
                part = idParts[_i];
                _results.push(part.replace(/_/g, ' '));
              }
              return _results;
            })()).join(' '),
            topLevel: idParts.length === 1,
            fields: table.fields,
            idField: table.idField,
            valueField: table.valueField,
            actions: ['view', 'add', 'edit', 'delete']
          };
          _ref = table.fields;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            sqlField = _ref[_i];
            addMapping(resourceName, sqlField[1], table.name, sqlField[1]);
          }
        }
      }
      return {
        resources: resources,
        resourceToSQLMappings: resourceToSQLMappings
      };
    };
  });

}).call(this);

define('ometa!server-glue/ServerURIParser',["ometa!sbvr-parser/SBVRLibs","underscore","ometa-core"],(function (SBVRLibs,_){var ServerURIParser=SBVRLibs._extend({
"Process":function(){var _fromIdx=this.input.idx,method,uri,body,resources,vocab,i,$elf=this;this._form((function(){method=(function(){switch(this._apply('anything')){case "GET":return "GET";case "POST":return "POST";case "PUT":return "PUT";case "DELETE":return "DELETE";default: throw this._fail()}}).call(this);(this["currentMethod"]=method);body=this._apply("anything");this._opt((function(){this._pred((! _.isArray(body)));return body=[({})]}));return this._form((function(){this._applyWithArgs("exactly","/");vocab=this._apply("Vocabulary");this._opt((function(){return this._applyWithArgs("exactly","/")}));(this["currentVocab"]=vocab);uri=["URI",["Vocabulary",vocab]];resources=[];i=(0);this._opt((function(){return (function (){for(undefined;(i < body["length"]);i++){(this["currentBody"]=body[i]);if((i < (body["length"] - (1)))){this._lookahead((function (){resources.push(this._apply("Resource"))}))}else{resources.push(this._apply("Resource"))}}}).call(this)}));return this._opt((function(){return this._applyWithArgs("exactly","/")}))}))}));return uri.concat(resources)},
"Vocabulary":function(){var _fromIdx=this.input.idx,$elf=this;return this._consumedBy((function(){return this._many1((function(){this._not((function(){return this._applyWithArgs("exactly","/")}));return this._apply("anything")}))}))},
"ResourcePart":function(){var _fromIdx=this.input.idx,resourcePart,$elf=this;resourcePart=this._consumedBy((function(){return this._many1((function(){return this._or((function(){return this._apply("letter")}),(function(){return (function(){switch(this._apply('anything')){case "_":return "_";default: throw this._fail()}}).call(this)}))}))}));return resourcePart.replace(new RegExp("_","g")," ")},
"ResourceName":function(){var _fromIdx=this.input.idx,$elf=this;return this._consumedBy((function(){this._apply("ResourcePart");return this._many((function(){this._applyWithArgs("exactly","-");return this._apply("ResourcePart")}))}))},
"Resource":function(){var _fromIdx=this.input.idx,resourceName,query,$elf=this;(this["newBody"]=[]);resourceName=this._apply("ResourceName");this._opt((function(){this._or((function(){return this._pred((this["currentMethod"] != "GET"))}),(function(){return this._lookahead((function(){return this._applyWithArgs("exactly","?")}))}));query=["Query"];this._applyWithArgs("AddQueryResource",query,resourceName);this._applyWithArgs("Modifiers",query);return this._opt((function(){return this._applyWithArgs("exactly","*")}))}));return ({"resourceName": resourceName,"query": query,"values": this["newBody"]})},
"Comparator":function(){var _fromIdx=this.input.idx,$elf=this;return (function(){switch(this._apply('anything')){case "~":return "Like";case "<":return this._or((function(){return (function(){switch(this._apply('anything')){case ":":return "LessThanOrEqual";default: throw this._fail()}}).call(this)}),(function(){return "LessThan"}));case ":":return "Equals";case ">":return this._or((function(){return (function(){switch(this._apply('anything')){case ":":return "GreaterThanOrEqual";default: throw this._fail()}}).call(this)}),(function(){return "GreaterThan"}));case "!":return (function(){this._applyWithArgs("exactly",":");"!:";return "NotEquals"}).call(this);default: throw this._fail()}}).call(this)},
"Modifiers":function(query){var _fromIdx=this.input.idx,limit,sorts,offset,$elf=this;this._applyWithArgs("exactly","?");return this._many((function(){this._opt((function(){return this._applyWithArgs("exactly","&")}));return this._or((function(){return this._applyWithArgs("Filters",query)}),(function(){sorts=this._apply("Sorts");return query.push(sorts)}),(function(){limit=this._apply("Limit");return query.push(limit)}),(function(){offset=this._apply("Offset");return query.push(offset)}))}))},
"Field":function(){var resourceFieldName,_fromIdx=this.input.idx,resourceName,mapping,$elf=this;this._or((function(){resourceName=this._apply("ResourcePart");this._applyWithArgs("exactly",".");return resourceFieldName=this._apply("ResourcePart")}),(function(){resourceName=this["currentResource"];return resourceFieldName=this._apply("ResourcePart")}));mapping=this._applyWithArgs("GetMapping",resourceName,resourceFieldName);return ["ReferencedField"].concat(mapping)},
"Filters":function(query){var resourceFieldName,_fromIdx=this.input.idx,resourceName,field,mapping,comparator,value,$elf=this;this._applyWithArgs("exactly","f");this._applyWithArgs("exactly","i");this._applyWithArgs("exactly","l");this._applyWithArgs("exactly","t");this._applyWithArgs("exactly","e");this._applyWithArgs("exactly","r");this._applyWithArgs("exactly","=");"filter=";return this._many1((function(){field=this._apply("Field");comparator=this._apply("Comparator");value=this._consumedBy((function(){return this._many1((function(){this._not((function(){return this._apply("ValueBreak")}));return this._apply("anything")}))}));this._opt((function(){return this._applyWithArgs("exactly",";")}));resourceName=field[(1)];resourceFieldName=field[(2)];mapping=this._applyWithArgs("GetMapping",resourceName,resourceFieldName);this._applyWithArgs("AddWhereClause",query,[comparator,field,["Bind",mapping[(0)],this.GetTableField(mapping)]]);return this._applyWithArgs("AddBodyVar",query,resourceName,resourceFieldName,mapping,value)}))},
"Number":function(){var _fromIdx=this.input.idx,d,$elf=this;d=this._consumedBy((function(){return this._many1((function(){return this._apply("digit")}))}));return ["Number",parseInt(d,(10))]},
"Limit":function(){var _fromIdx=this.input.idx,num,$elf=this;this._applyWithArgs("exactly","l");this._applyWithArgs("exactly","i");this._applyWithArgs("exactly","m");this._applyWithArgs("exactly","i");this._applyWithArgs("exactly","t");this._applyWithArgs("exactly","=");"limit=";num=this._apply("Number");return ["Limit",num]},
"Offset":function(){var _fromIdx=this.input.idx,num,$elf=this;this._applyWithArgs("exactly","o");this._applyWithArgs("exactly","f");this._applyWithArgs("exactly","f");this._applyWithArgs("exactly","s");this._applyWithArgs("exactly","e");this._applyWithArgs("exactly","t");this._applyWithArgs("exactly","=");"offset=";num=this._apply("Number");return ["Offset",num]},
"Sorts":function(){var _fromIdx=this.input.idx,field,sorts,direction,$elf=this;this._applyWithArgs("exactly","o");this._applyWithArgs("exactly","r");this._applyWithArgs("exactly","d");this._applyWithArgs("exactly","e");this._applyWithArgs("exactly","r");this._applyWithArgs("exactly","=");"order=";sorts=this._many1((function(){field=this._apply("Field");this._applyWithArgs("exactly",":");direction=(function(){switch(this._apply('anything')){case "D":return (function(){this._applyWithArgs("exactly","E");this._applyWithArgs("exactly","S");this._applyWithArgs("exactly","C");return "DESC"}).call(this);case "A":return (function(){this._applyWithArgs("exactly","S");this._applyWithArgs("exactly","C");return "ASC"}).call(this);default: throw this._fail()}}).call(this);this._opt((function(){return this._applyWithArgs("exactly",";")}));return [direction,field]}));return ["OrderBy"].concat(sorts)},
"ValueBreak":function(){var _fromIdx=this.input.idx,$elf=this;return (function(){switch(this._apply('anything')){case "/":return "/";case "*":return "*";case ";":return ";";default: throw this._fail()}}).call(this)}});(ServerURIParser["initialize"]=(function (){(this["sqlModels"]=({}));(this["clientModels"]=({}));(this["currentVocab"]="");(this["currentMethod"]="");(this["currentBody"]=[]);(this["currentResource"]=null)}));(ServerURIParser["GetTableField"]=(function (mapping){return SBVRLibs["GetTableField"].call(this,this["sqlModels"][this["currentVocab"]]["tables"][mapping[(0)]],mapping[(1)])}));(ServerURIParser["GetMapping"]=(function (resourceName,resourceFieldName){var resourceMapping = this["clientModels"][this["currentVocab"]]["resourceToSQLMappings"][resourceName];if(resourceMapping.hasOwnProperty(resourceFieldName)){return resourceMapping[resourceFieldName]}else{undefined};(resourceFieldName=resourceFieldName.replace(/ /g,"_"));if(resourceMapping.hasOwnProperty(resourceFieldName)){return resourceMapping[resourceFieldName]}else{undefined};throw ((("Could not map resource: " + resourceName) + " - ") + resourceFieldName)}));(ServerURIParser["setSQLModel"]=(function (vocab,model){(this["sqlModels"][vocab]=model)}));(ServerURIParser["setClientModel"]=(function (vocab,model){(this["clientModels"][vocab]=model)}));(ServerURIParser["AddWhereClause"]=(function (query,whereBody){if(((whereBody[(0)] == "Exists") && ((((whereBody[(1)][(0)] == "SelectQuery") || (whereBody[(1)][(0)] == "InsertQuery")) || (whereBody[(1)][(0)] == "UpdateQuery")) || (whereBody[(1)][(0)] == "UpsertQuery")))){(whereBody=whereBody[(1)].slice((1)));for(var i = (0);(i < whereBody["length"]);i++){if((whereBody[i][(0)] == "From")){query.push(whereBody[i])}else{undefined}};for(var i = (0);(i < whereBody["length"]);i++){if((whereBody[i][(0)] == "Where")){this.AddWhereClause(query,whereBody[i][(1)])}else{undefined}}}else{for(var i = (1);(i < query["length"]);i++){if((query[i][(0)] == "Where")){(query[i][(1)]=["And",query[i][(1)],whereBody]);return undefined}else{undefined}};query.push(["Where",whereBody])};if(((query[(0)] == "UpsertQuery") && (whereBody[(0)] == "Equals"))){var field,bind;if((whereBody[(1)][(0)] == "Field")){(field=whereBody[(1)][(1)])}else{if((whereBody[(1)][(0)] == "ReferencedField")){(field=whereBody[(1)][(2)])}else{if((whereBody[(2)][(0)] == "Field")){(field=whereBody[(2)][(1)])}else{if((whereBody[(2)][(0)] == "ReferencedField")){(field=whereBody[(2)][(2)])}else{undefined}}}};if((whereBody[(1)][(0)] == "Bind")){(bind=whereBody[(1)])}else{if((whereBody[(2)][(0)] == "Bind")){(bind=whereBody[(2)])}else{undefined}};for(var i = (1);(i < query["length"]);i++){var queryPart = query[i];if((queryPart[(0)] == "Fields")){for(var j = (0);(j < queryPart[(1)]["length"]);j++){var queryFields = queryPart[(1)][j];if((queryFields[(0)] == field)){(queryFields[(1)]=bind);break}else{undefined}};if((j === queryPart[(1)]["length"])){queryPart[(1)].push([field,bind])}else{undefined};break}else{undefined}}}else{undefined}}));(ServerURIParser["AddBodyVar"]=(function (query,resourceName,resourceFieldName,mapping,value){if((value === undefined)){if(this["currentBody"].hasOwnProperty(((resourceName + ".") + resourceFieldName))){(value=this["currentBody"][((resourceName + ".") + resourceFieldName)])}else{if(this["currentBody"].hasOwnProperty(resourceFieldName)){(value=this["currentBody"][resourceFieldName])}else{var sqlTable = this["sqlModels"][this["currentVocab"]]["tables"][mapping[(0)]];if(sqlTable.hasOwnProperty("fields")){for(var i = (0);(i < sqlTable["fields"]["length"]);i++){var sqlField = sqlTable["fields"][i];if((sqlField[(1)] == mapping[(1)])){if((sqlField[(0)] == "Serial")){this.AddQueryTable(query,mapping[(0)])}else{undefined};return undefined}else{undefined}}}else{undefined};return undefined}}}else{undefined};this.AddQueryTable(query,mapping[(0)]);return (this["newBody"][mapping.join(".")]=value)}));(ServerURIParser["AddQueryTable"]=(function (query,tableName){var i = (0);for(undefined;(i < query["length"]);i++){if(((query[i][(0)] === "From") && (query[i][(1)] === tableName))){return undefined}else{undefined}};query.push(["From",tableName])}));(ServerURIParser["AddQueryResource"]=(function (query,resourceName){var newValue,fieldName,fields,mapping,resourceFieldName,$elf = this,clientModel = this["clientModels"][this["currentVocab"]],resourceModel = clientModel["resources"][resourceName],resourceToSQLMappings = clientModel["resourceToSQLMappings"][resourceName],getSelectFields = (function (){var mapping,resourceField,fields = [];for(resourceField in resourceToSQLMappings){if(resourceToSQLMappings.hasOwnProperty(resourceField)){(mapping=resourceToSQLMappings[resourceField]);$elf.AddQueryTable(query,mapping[(0)]);fields.push([["ReferencedField"].concat(mapping),resourceField])}else{undefined}};return fields});(this["currentResource"]=resourceName);switch(this["sqlModels"][this["currentVocab"]]["tables"][resourceName]){case "ForeignKey": {switch(this["currentMethod"]){case "GET": {(query[(0)]="SelectQuery");query.push(["Select",getSelectFields()]);break};default: __TODO__.die()}break};case "Attribute": {(resourceFieldName=resourceModel["valueField"]);(mapping=this.GetMapping(resourceName,resourceFieldName));switch(this["currentMethod"]){case "DELETE": {(query[(0)]="UpdateQuery");this.AddQueryTable(query,mapping[(0)]);query.push(["Fields",[[mapping[(1)],"NULL"]]]);break};case "GET": {(query[(0)]="SelectQuery");query.push(["Select",getSelectFields()]);break};case "PUT": {};case "POST": {(query[(0)]="UpdateQuery");if((this.AddBodyVar(query,resourceName,resourceFieldName,mapping) !== undefined)){query.push(["Fields",[[mapping[(0)],["Bind",mapping[(0)],this.GetTableField(mapping)]]]])}else{undefined}break}}break};case "BooleanAttribute": {(resourceFieldName=resourceModel["valueField"]);(mapping=this.GetMapping(resourceName,resourceFieldName));switch(this["currentMethod"]){case "GET": {(query[(0)]="SelectQuery");query.push(["Select",getSelectFields()]);this.AddQueryTable(query,mapping[(0)]);this.AddWhereClause(query,["Equals",["ReferencedField"].concat(mapping),["Boolean",true]]);break};case "DELETE": (newValue=false);case "PUT": {};case "POST": {if((newValue == null)){(newValue=true)}else{undefined}(query[(0)]="UpdateQuery");query.push(["Fields",[[mapping[(1)],newValue]]]);this.AddQueryTable(query,mapping[(0)]);(resourceFieldName=resourceModel["idField"]);(mapping=this.GetMapping(resourceName,resourceFieldName));(fieldName=mapping[(1)]);if((this.AddBodyVar(query,resourceName,resourceFieldName,mapping) !== undefined)){this.AddWhereClause(query,["Equals",["ReferencedField"].concat(mapping),["Bind",mapping[(0)],this.GetTableField(mapping)]])}else{undefined}break}}break};default: {switch(this["currentMethod"]){case "DELETE": {(query[(0)]="DeleteQuery");break};case "GET": {(query[(0)]="SelectQuery");query.push(["Select",getSelectFields()]);break};case "PUT": {};case "POST": {if((this["currentMethod"] === "PUT")){(query[(0)]="UpsertQuery")}else{(query[(0)]="InsertQuery")}(fields=[]);for(resourceFieldName in resourceToSQLMappings){if(resourceToSQLMappings.hasOwnProperty(resourceFieldName)){(mapping=resourceToSQLMappings[resourceFieldName]);if((this.AddBodyVar(query,resourceName,resourceFieldName,mapping) !== undefined)){fields.push([mapping[(1)],["Bind",mapping[(0)],this.GetTableField(mapping)]])}else{undefined}}else{undefined}}query.push(["Fields",fields]);break}}break}}}));return ServerURIParser}));
define('ometa!database-layer/SQLBinds',["ometa-core"],(function (){var SQLBinds=OMeta._extend({
"skipToEnd":function(quote){var found,_fromIdx=this.input.idx,prev,text,$elf=this;text=this._many((function(){this._not((function(){return (found == quote)}));return this._or((function(){this._not((function(){return ((prev == quote) || (prev == "\\"))}));return found=this._applyWithArgs("seq",quote)}),(function(){return prev=this._apply("anything")}))}));return text.join("")},
"parse":function(nextBind){var _fromIdx=this.input.idx,quote,text,sql,$elf=this;sql=this._many((function(){return this._or((function(){quote=(function(){switch(this._apply('anything')){case "\"":return "\"";case "'":return "'";default: throw this._fail()}}).call(this);text=this._applyWithArgs("skipToEnd",quote);return [quote,text].join("")}),(function(){return (function(){switch(this._apply('anything')){case "?":return nextBind();default: throw this._fail()}}).call(this)}),(function(){return this._apply("anything")}))}));return sql.join("")}});return SQLBinds}));
(function() {

  define('cs!database-layer/db',["ometa!database-layer/SQLBinds", 'has'], function(SQLBinds, has) {
    var exports;
    exports = {};
    if (true) {
      exports.postgres = function(connectString) {
        var Tx, createResult, pg;
        pg = require('pg');
        createResult = function(rows) {
          var _ref;
          return {
            rows: {
              length: (rows != null ? rows.length : void 0) || 0,
              item: function(i) {
                return rows[i];
              },
              forEach: function(iterator, thisArg) {
                return rows.forEach(iterator, thisArg);
              }
            },
            insertId: ((_ref = rows[0]) != null ? _ref.id : void 0) || null
          };
        };
        Tx = (function() {

          function Tx(_db) {
            this.executeSql = function(sql, _bindings, callback, errorCallback, addReturning) {
              var bindNo, bindings, thisTX;
              if (_bindings == null) {
                _bindings = [];
              }
              if (addReturning == null) {
                addReturning = true;
              }
              thisTX = this;
              bindings = _bindings.slice(0);
              sql = sql.replace(/GROUP BY NULL/g, '');
              sql = sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
              if (addReturning && /^\s*INSERT\s+INTO/i.test(sql)) {
                sql = sql.replace(/;?$/, ' RETURNING id;');
                console.log(sql);
              }
              bindNo = 0;
              sql = SQLBinds.matchAll(sql, "parse", [
                function() {
                  var bindString, i, initialBindNo, _i, _len, _ref;
                  initialBindNo = bindNo;
                  bindString = '$' + ++bindNo;
                  if (Array.isArray(bindings[initialBindNo])) {
                    _ref = bindings[initialBindNo].slice(1);
                    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                      i = _ref[_i];
                      bindString += ',' + '$' + ++bindNo;
                    }
                    Array.prototype.splice.apply(bindings, [initialBindNo, 1].concat(bindings[initialBindNo]));
                  }
                  return bindString;
                }
              ]);
              return _db.query({
                text: sql,
                values: bindings
              }, function(err, res) {
                if (err != null) {
                  if (typeof errorCallback === "function") {
                    errorCallback(thisTX, err);
                  }
                  return console.log(sql, bindings, err);
                } else {
                  return typeof callback === "function" ? callback(thisTX, createResult(res.rows)) : void 0;
                }
              });
            };
          }

          Tx.prototype.begin = function() {
            return this.executeSql('BEGIN;');
          };

          Tx.prototype.end = function() {
            return this.executeSql('END;');
          };

          Tx.prototype.rollback = function() {
            return this.executeSql('ROLLBACK;');
          };

          Tx.prototype.tableList = function(callback, errorCallback, extraWhereClause) {
            if (extraWhereClause == null) {
              extraWhereClause = '';
            }
            if (extraWhereClause !== '') {
              extraWhereClause = ' WHERE ' + extraWhereClause;
            }
            return this.executeSql("SELECT * FROM (SELECT tablename as name FROM pg_tables WHERE schemaname = 'public') t" + extraWhereClause + ";", [], callback, errorCallback);
          };

          Tx.prototype.dropTable = function(tableName, ifExists, callback, errorCallback) {
            if (ifExists == null) {
              ifExists = true;
            }
            return this.executeSql('DROP TABLE ' + (ifExists === true ? 'IF EXISTS ' : '') + '"' + tableName + '" CASCADE;', [], callback, errorCallback);
          };

          return Tx;

        })();
        return {
          transaction: function(callback, errorCallback) {
            return pg.connect(connectString, function(err, client) {
              if (err) {
                return typeof errorCallback === "function" ? errorCallback(err) : void 0;
              } else {
                return callback(new Tx(client));
              }
            });
          }
        };
      };
      exports.mysql = function(options) {
        var Tx, createResult, mysql;
        mysql = new require('mysql');
        createResult = function(rows) {
          return {
            rows: {
              length: (rows != null ? rows.length : void 0) || 0,
              item: function(i) {
                return rows[i];
              },
              forEach: function(iterator, thisArg) {
                return rows.forEach(iterator, thisArg);
              }
            },
            insertId: rows.insertId || null
          };
        };
        Tx = (function() {

          function Tx(_db) {
            var connectionClosed, currentlyQueuedStatements;
            currentlyQueuedStatements = 0;
            connectionClosed = false;
            this.executeSql = function(sql, bindings, callback, errorCallback, addReturning) {
              var thisTX;
              if (bindings == null) {
                bindings = [];
              }
              if (addReturning == null) {
                addReturning = true;
              }
              if (connectionClosed) {
                throw 'Trying to executeSQL on a closed connection';
              }
              currentlyQueuedStatements++;
              thisTX = this;
              sql = sql.replace(/GROUP BY NULL/g, '');
              sql = sql.replace(/AUTOINCREMENT/g, 'AUTO_INCREMENT');
              sql = sql.replace(/DROP CONSTRAINT/g, 'DROP FOREIGN KEY');
              return _db.query(sql, bindings, function(err, res, fields) {
                try {
                  if (err != null) {
                    if (typeof errorCallback === "function") {
                      errorCallback(thisTX, err);
                    }
                    return console.log(sql, bindings, err);
                  } else {
                    return typeof callback === "function" ? callback(thisTX, createResult(res)) : void 0;
                  }
                } finally {
                  currentlyQueuedStatements--;
                  if (currentlyQueuedStatements === 0) {
                    connectionClosed = true;
                    _db.end();
                  }
                }
              });
            };
          }

          Tx.prototype.begin = function() {
            return this.executeSql('START TRANSACTION;');
          };

          Tx.prototype.end = function() {
            return this.executeSql('COMMIT;');
          };

          Tx.prototype.rollback = function() {
            return this.executeSql('ROLLBACK;');
          };

          Tx.prototype.tableList = function(callback, errorCallback, extraWhereClause) {
            if (extraWhereClause == null) {
              extraWhereClause = '';
            }
            if (extraWhereClause !== '') {
              extraWhereClause = ' WHERE ' + extraWhereClause;
            }
            return this.executeSql("SELECT name FROM (SELECT table_name as name FROM information_schema.tables WHERE table_schema = ?) t" + extraWhereClause + ";", [options.database], callback, errorCallback);
          };

          Tx.prototype.dropTable = function(tableName, ifExists, callback, errorCallback) {
            if (ifExists == null) {
              ifExists = true;
            }
            return this.executeSql('DROP TABLE ' + (ifExists === true ? 'IF EXISTS ' : '') + '"' + tableName + '";', [], callback, errorCallback);
          };

          return Tx;

        })();
        return {
          transaction: function(callback, errorCallback) {
            var _db;
            _db = mysql.createConnection(options);
            _db.query("SET sql_mode='ANSI_QUOTES';");
            return callback(new Tx(_db));
          }
        };
      };
      exports.sqlite = function(filepath) {
        var createResult, sqlite3, tx, _db;
        sqlite3 = require('sqlite3').verbose();
        _db = new sqlite3.Database(filepath);
        createResult = function(rows) {
          return {
            rows: {
              length: (rows != null ? rows.length : void 0) || 0,
              item: function(i) {
                return rows[i];
              },
              forEach: function(iterator, thisArg) {
                return rows.forEach(iterator, thisArg);
              }
            },
            insertId: rows.insertId || null
          };
        };
        tx = {
          executeSql: function(sql, bindings, callback, errorCallback) {
            var thisTX;
            thisTX = this;
            return _db.all(sql, bindings != null ? bindings : [], function(err, rows) {
              if (err != null) {
                if (typeof errorCallback === "function") {
                  errorCallback(thisTX, err);
                }
                return console.log(sql, err);
              } else {
                return typeof callback === "function" ? callback(thisTX, createResult(rows)) : void 0;
              }
            });
          },
          begin: function() {
            return this.executeSql('BEGIN;');
          },
          end: function() {
            return this.executeSql('END;');
          },
          rollback: function() {
            return this.executeSql('ROLLBACK;');
          },
          tableList: function(callback, errorCallback, extraWhereClause) {
            if (extraWhereClause == null) {
              extraWhereClause = '';
            }
            if (extraWhereClause !== '') {
              extraWhereClause = ' AND ' + extraWhereClause;
            }
            return this.executeSql("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT IN ('sqlite_sequence')" + extraWhereClause + ";", [], callback, errorCallback);
          },
          dropTable: function(tableName, ifExists, callback, errorCallback) {
            if (ifExists == null) {
              ifExists = true;
            }
            return this.executeSql('DROP TABLE ' + (ifExists === true ? 'IF EXISTS ' : '') + '"' + tableName + '";', [], callback, errorCallback);
          }
        };
        return {
          transaction: function(callback) {
            return _db.serialize(function() {
              return callback(tx);
            });
          }
        };
      };
    } else {
      exports.websql = function(databaseName) {
        var createResult, tx, _db;
        _db = openDatabase(databaseName, "1.0", "rulemotion", 2 * 1024 * 1024);
        createResult = function(result) {
          var insertId;
          try {
            insertId = result.insertId;
          } catch (e) {
            insertId = null;
          }
          return {
            rows: {
              length: result.rows.length,
              item: function(i) {
                return result.rows.item(i);
              },
              forEach: function(iterator, thisArg) {
                var i, _i, _ref, _results;
                _results = [];
                for (i = _i = 0, _ref = result.rows.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
                  _results.push(iterator.call(thisArg, result.rows.item(i), i, result.rows));
                }
                return _results;
              }
            },
            insertId: insertId
          };
        };
        tx = function(_tx) {
          return {
            executeSql: function(sql, bindings, callback, errorCallback) {
              var thisTX;
              thisTX = this;
              try {
                return ___STACK_TRACE___.please;
              } catch (stackTrace) {
                null;
                if (callback != null) {
                  callback = (function(callback) {
                    return function(_tx, _results) {
                      return callback(thisTX, createResult(_results));
                    };
                  })(callback);
                }
                errorCallback = (function(errorCallback) {
                  return function(_tx, _err) {
                    console.log(sql, bindings, _err, stackTrace.stack);
                    return typeof errorCallback === "function" ? errorCallback(thisTX, _err) : void 0;
                  };
                })(errorCallback);
                return _tx.executeSql(sql, bindings, callback, errorCallback);
              }
            },
            begin: function() {},
            end: function() {},
            rollback: function() {
              return _tx.executeSql("DROP TABLE '__Fo0oFoo'");
            },
            tableList: function(callback, errorCallback, extraWhereClause) {
              if (extraWhereClause == null) {
                extraWhereClause = '';
              }
              if (extraWhereClause !== '') {
                extraWhereClause = ' AND ' + extraWhereClause;
              }
              return this.executeSql("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT IN ('__WebKitDatabaseInfoTable__', 'sqlite_sequence')" + extraWhereClause + ";", [], callback, errorCallback);
            },
            dropTable: function(tableName, ifExists, callback, errorCallback) {
              if (ifExists == null) {
                ifExists = true;
              }
              return this.executeSql('DROP TABLE ' + (ifExists === true ? 'IF EXISTS ' : '') + '"' + tableName + '";', [], callback, errorCallback);
            }
          };
        };
        return {
          transaction: function(callback) {
            return _db.transaction(function(_tx) {
              return callback(tx(_tx));
            });
          }
        };
      };
    }
    exports.connect = function(databaseOptions) {
      return exports[databaseOptions.engine](databaseOptions.params);
    };
    return exports;
  });

}).call(this);

(function() {

  define('cs!server-glue/sbvr-utils',['ometa!sbvr-parser/SBVRParser', 'ometa!sbvr-compiler/LF2AbstractSQLPrep', 'ometa!sbvr-compiler/LF2AbstractSQL', 'cs!sbvr-compiler/AbstractSQL2SQL', 'ometa!sbvr-compiler/AbstractSQLRules2SQL', 'cs!sbvr-compiler/AbstractSQL2CLF', 'ometa!server-glue/ServerURIParser', 'async', 'cs!database-layer/db', 'underscore'], function(SBVRParser, LF2AbstractSQLPrep, LF2AbstractSQL, AbstractSQL2SQL, AbstractSQLRules2SQL, AbstractSQL2CLF, ServerURIParser, async, dbModule, _) {
    var clientModels, db, devModel, endTransaction, executeModel, executeStandardModels, exports, getAndCheckBindValues, getID, parseURITree, runDelete, runGet, runPost, runPut, runURI, serverURIParser, sqlModels, transactionModel, userModel, validateDB;
    exports = {};
    db = null;
    devModel = 'Term:      Short Text\nTerm:      JSON\n\nTerm:      model\n	Database Value Field: model_value\nTerm:      vocabulary\n	Concept Type: Short Text\nTerm:      model type\n	Concept Type: Short Text\nTerm:      model value\n	Concept Type: JSON\n\nFact Type: model is of vocabulary\nRule: It is obligatory that each model is of exactly one vocabulary\nFact Type: model has model type\nRule: It is obligatory that each model has exactly one model type \nFact Type: model has model value\nRule: It is obligatory that each model has exactly one model value';
    transactionModel = 'Term:      Integer\nTerm:      Short Text\nTerm:      Long Text\nTerm:      resource id\n	Concept type: Integer\nTerm:      resource type\n	Concept type: Long Text\nTerm:      field name\n	Concept type: Long Text\nTerm:      field value\n	Concept type: Long Text\nTerm:      placeholder\n	Concept type: Short Text\n\nTerm:      resource\n	Database Value Field: resource_id\nFact type: resource has resource id\nRule:      It is obligatory that each resource has exactly 1 resource id.\nFact type: resource has resource type\nRule:      It is obligatory that each resource has exactly 1 resource type.\n\nTerm:      transaction\n	Database Value Field: id\n\nTerm:      lock\n	Database Value Field: id\nFact type: lock is exclusive\nFact type: lock belongs to transaction\nRule:      It is obligatory that each lock belongs to exactly 1 transaction.\nFact type: resource is under lock\n	Synonymous Form: lock is on resource\nRule:      It is obligatory that each resource that is under a lock that is exclusive, is under at most 1 lock.\n\nTerm:      conditional type\n	Concept Type: Short Text\n	Definition: ADD or EDIT or DELETE\n\nTerm:      conditional resource\n	Database Value Field: id\nFact type: conditional resource belongs to transaction\nRule:      It is obligatory that each conditional resource belongs to exactly 1 transaction.\nFact type: conditional resource has lock\nRule:      It is obligatory that each conditional resource has at most 1 lock.\nFact type: conditional resource has resource type\nRule:      It is obligatory that each conditional resource has exactly 1 resource type.\nFact type: conditional resource has conditional type\nRule:      It is obligatory that each conditional resource has exactly 1 conditional type.\nFact type: conditional resource has placeholder\nRule:      It is obligatory that each conditional resource has at most 1 placeholder.\n--Rule:      It is obligatory that each conditional resource that has a placeholder, has a conditional type that is of "ADD".\n\nTerm:      conditional field\n	Database Value Field: field_name\nFact type: conditional field has field name\nRule:      It is obligatory that each conditional field has exactly 1 field name.\nFact type: conditional field has field value\nRule:      It is obligatory that each conditional field has at most 1 field value.\nFact type: conditional field is of conditional resource\nRule:      It is obligatory that each conditional field is of exactly 1 conditional resource.\n\n--Rule:      It is obligatory that each conditional resource that has a conditional type that is of "EDIT" or "DELETE", has a lock that is exclusive\nRule:      It is obligatory that each conditional resource that has a lock, has a resource type that is of a resource that the lock is on.\nRule:      It is obligatory that each conditional resource that has a lock, belongs to a transaction that the lock belongs to.';
    userModel = 'Term:      Hashed\nTerm:      Short Text\n\nTerm:      user\n	Database Value Field: username\nTerm:      username\n	Concept Type: Short Text\nTerm:      password\n	Concept Type: Hashed\nFact type: user has username\nRule:      It is obligatory that each user has exactly one username.\nRule:      It is obligatory that each username is of exactly one user.\nFact type: user has password\nRule:      It is obligatory that each user has exactly one password.';
    serverURIParser = ServerURIParser.createInstance();
    sqlModels = {};
    clientModels = {};
    getAndCheckBindValues = function(bindings, values) {
      var bindValues, binding, field, fieldName, referencedName, validated, value, _i, _len, _ref;
      bindValues = [];
      for (_i = 0, _len = bindings.length; _i < _len; _i++) {
        binding = bindings[_i];
        field = binding[1];
        fieldName = field[1];
        referencedName = binding[0] + '.' + fieldName;
        value = values[referencedName] === void 0 ? values[fieldName] : values[referencedName];
        _ref = AbstractSQL2SQL.dataTypeValidate(value, field), validated = _ref.validated, value = _ref.value;
        if (validated !== true) {
          return '"' + fieldName + '" ' + validated;
        }
        bindValues.push(value);
      }
      return bindValues;
    };
    endTransaction = function(transactionID, callback) {
      return db.transaction(function(tx) {
        var getFieldsObject, getLockedRow, placeholders, resolvePlaceholder;
        placeholders = {};
        getLockedRow = function(lockID, callback) {
          return tx.executeSql('SELECT r."resource_type", r."resource_id"\nFROM "resource-is_under-lock" rl\nJOIN "resource" r ON rl."resource" = r."id"\nWHERE "lock" = ?;', [lockID], function(tx, row) {
            return callback(null, row);
          }, function(tx, err) {
            return callback(err);
          });
        };
        getFieldsObject = function(conditionalResourceID, clientModel, callback) {
          return tx.executeSql('SELECT "field_name", "field_value" FROM "conditional_field" WHERE "conditional_resource" = ?;', [conditionalResourceID], function(tx, fields) {
            var fieldsObject;
            fieldsObject = {};
            return async.forEach(fields.rows, function(field, callback) {
              var fieldName, fieldValue;
              fieldName = field.field_name;
              fieldName = fieldName.replace(clientModel.resourceName + '.', '');
              fieldValue = field.field_value;
              return async.forEach(clientModel.fields, function(modelField, callback) {
                var placeholderCallback;
                placeholderCallback = function(placeholder, resolvedID) {
                  if (resolvedID === false) {
                    return callback('Placeholder failed' + fieldValue);
                  } else {
                    fieldsObject[fieldName] = resolvedID;
                    return callback();
                  }
                };
                if (modelField[1] === fieldName && modelField[0] === 'ForeignKey' && _.isNaN(Number(fieldValue))) {
                  if (!placeholders.hasOwnProperty(fieldValue)) {
                    return callback('Cannot resolve placeholder' + fieldValue);
                  } else if (_.isArray(placeholders[fieldValue])) {
                    return placeholders[fieldValue].push(placeholderCallback);
                  } else {
                    return placeholderCallback(fieldValue, placeholders[fieldValue]);
                  }
                } else {
                  fieldsObject[fieldName] = fieldValue;
                  return callback();
                }
              }, callback);
            }, function(err) {
              return callback(err, fieldsObject);
            });
          }, function(tx, err) {
            return callback(err);
          });
        };
        resolvePlaceholder = function(placeholder, resolvedID) {
          var placeholderCallback, placeholderCallbacks, _i, _len, _results;
          placeholderCallbacks = placeholders[placeholder];
          placeholders[placeholder] = resolvedID;
          _results = [];
          for (_i = 0, _len = placeholderCallbacks.length; _i < _len; _i++) {
            placeholderCallback = placeholderCallbacks[_i];
            _results.push(placeholderCallback(placeholder, resolvedID));
          }
          return _results;
        };
        return tx.executeSql('SELECT * FROM "conditional_resource" WHERE "transaction" = ?;', [transactionID], function(tx, conditionalResources) {
          conditionalResources.rows.forEach(function(conditionalResource) {
            var placeholder;
            placeholder = conditionalResource.placeholder;
            if ((placeholder != null) && placeholder.length > 0) {
              return placeholders[placeholder] = [];
            }
          });
          return async.forEach(conditionalResources.rows, function(conditionalResource, callback) {
            var clientModel, doCleanup, lockID, placeholder, requestBody, uri;
            placeholder = conditionalResource.placeholder;
            lockID = conditionalResource.lock;
            doCleanup = function() {
              return async.parallel([
                function(callback) {
                  return tx.executeSql('DELETE FROM "conditional_field" WHERE "conditional_resource" = ?;', [conditionalResource.id], function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }, function(callback) {
                  return tx.executeSql('DELETE FROM "conditional_resource" WHERE "lock" = ?;', [lockID], function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }, function(callback) {
                  return tx.executeSql('DELETE FROM "resource-is_under-lock" WHERE "lock" = ?;', [lockID], function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }, function(callback) {
                  return tx.executeSql('DELETE FROM "lock" WHERE "id" = ?;', [lockID], function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }
              ], callback);
            };
            clientModel = clientModels['data'].resources[conditionalResource.resource_type];
            uri = '/data/' + conditionalResource.resource_type;
            requestBody = [{}];
            switch (conditionalResource.conditional_type) {
              case 'DELETE':
                return getLockedRow(lockID, function(err, lockedRow) {
                  if (err != null) {
                    return callback(err);
                  } else {
                    lockedRow = lockedRow.rows.item(0);
                    uri = uri + '?filter=' + clientModel.idField + ':' + lockedRow.resource_id;
                    return runURI('DELETE', uri, requestBody, tx, doCleanup, function() {
                      return callback(arguments);
                    });
                  }
                });
              case 'EDIT':
                return getLockedRow(lockID, function(err, lockedRow) {
                  if (err != null) {
                    return callback(err);
                  } else {
                    lockedRow = lockedRow.rows.item(0);
                    uri = uri + '?filter=' + clientModel.idField + ':' + lockedRow.resource_id;
                    return getFieldsObject(conditionalResource.id, clientModel, function(err, fields) {
                      if (err != null) {
                        return callback(err);
                      } else {
                        return runURI('PUT', uri, [fields], tx, doCleanup, function() {
                          return callback(arguments);
                        });
                      }
                    });
                  }
                });
              case 'ADD':
                return getFieldsObject(conditionalResource.id, clientModel, function(err, fields) {
                  if (err != null) {
                    resolvePlaceholder(placeholder, false);
                    return callback(err);
                  } else {
                    return runURI('POST', uri, [fields], tx, function(result) {
                      resolvePlaceholder(placeholder, result.id);
                      return doCleanup();
                    }, function() {
                      resolvePlaceholder(placeholder, false);
                      return callback(arguments);
                    });
                  }
                });
            }
          }, function(err) {
            if (err != null) {
              return callback(err);
            } else {
              return tx.executeSql('DELETE FROM "transaction" WHERE "id" = ?;', [transactionID], function(tx, result) {
                return validateDB(tx, sqlModels['data'], function() {
                  return callback();
                }, function(tx, err) {
                  return callback(err);
                });
              }, function(tx, err) {
                return callback(err);
              });
            }
          });
        });
      });
    };
    validateDB = function(tx, sqlmod, successCallback, failureCallback) {
      return async.forEach(sqlmod.rules, function(rule, callback) {
        return tx.executeSql(rule.sql, [], function(tx, result) {
          var _ref;
          if ((_ref = result.rows.item(0).result) === false || _ref === 0 || _ref === '0') {
            return callback(rule.structuredEnglish);
          } else {
            return callback();
          }
        }, function(tx, err) {
          return callback(err);
        });
      }, function(err) {
        if (err != null) {
          tx.rollback();
          return failureCallback(tx, err);
        } else {
          tx.end();
          return successCallback(tx);
        }
      });
    };
    exports.executeModel = executeModel = function(tx, vocab, seModel, successCallback, failureCallback) {
      var abstractSqlModel, clientModel, createStatement, lfModel, slfModel, sqlModel, _i, _len, _ref;
      try {
        lfModel = SBVRParser.matchAll(seModel, 'Process');
      } catch (e) {
        console.log('Error parsing model', e);
        return failureCallback(tx, 'Error parsing model');
      }
      slfModel = LF2AbstractSQLPrep.match(lfModel, 'Process');
      abstractSqlModel = LF2AbstractSQL.match(slfModel, 'Process');
      sqlModel = AbstractSQL2SQL.generate(abstractSqlModel);
      clientModel = AbstractSQL2CLF(sqlModel);
      _ref = sqlModel.createSchema;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        createStatement = _ref[_i];
        tx.executeSql(createStatement);
      }
      return validateDB(tx, sqlModel, function(tx) {
        sqlModels[vocab] = sqlModel;
        clientModels[vocab] = clientModel;
        serverURIParser.setSQLModel(vocab, abstractSqlModel);
        serverURIParser.setClientModel(vocab, clientModel);
        runURI('PUT', '/dev/model?filter=model_type:se', [
          {
            vocabulary: vocab,
            model_value: seModel
          }
        ], tx);
        runURI('PUT', '/dev/model?filter=model_type:lf', [
          {
            vocabulary: vocab,
            model_value: lfModel
          }
        ], tx);
        runURI('PUT', '/dev/model?filter=model_type:slf', [
          {
            vocabulary: vocab,
            model_value: slfModel
          }
        ], tx);
        runURI('PUT', '/dev/model?filter=model_type:abstractsql', [
          {
            vocabulary: vocab,
            model_value: abstractSqlModel
          }
        ], tx);
        runURI('PUT', '/dev/model?filter=model_type:sql', [
          {
            vocabulary: vocab,
            model_value: sqlModel
          }
        ], tx);
        runURI('PUT', '/dev/model?filter=model_type:client', [
          {
            vocabulary: vocab,
            model_value: clientModel
          }
        ], tx);
        return successCallback(tx, lfModel, slfModel, abstractSqlModel, sqlModel, clientModel);
      }, failureCallback);
    };
    exports.deleteModel = function(vocabulary) {
      return db.transaction((function(sqlmod) {
        return function(tx) {
          var dropStatement, _i, _len, _ref;
          _ref = sqlmod.dropSchema;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            dropStatement = _ref[_i];
            tx.executeSql(dropStatement);
          }
          runURI('DELETE', '/dev/model?filter=model_type:se', [
            {
              vocabulary: vocabulary
            }
          ], tx);
          runURI('DELETE', '/dev/model?filter=model_type:lf', [
            {
              vocabulary: vocabulary
            }
          ], tx);
          runURI('DELETE', '/dev/model?filter=model_type:slf', [
            {
              vocabulary: vocabulary
            }
          ], tx);
          runURI('DELETE', '/dev/model?filter=model_type:abstractsql', [
            {
              vocabulary: vocabulary
            }
          ], tx);
          runURI('DELETE', '/dev/model?filter=model_type:sql', [
            {
              vocabulary: vocabulary
            }
          ], tx);
          runURI('DELETE', '/dev/model?filter=model_type:client', [
            {
              vocabulary: vocabulary
            }
          ], tx);
          sqlModels[vocabulary] = [];
          serverURIParser.setSQLModel(vocabulary, sqlModels[vocabulary]);
          clientModels[vocabulary] = [];
          return serverURIParser.setClientModel(vocabulary, clientModels[vocabulary]);
        };
      }));
    };
    getID = function(tree) {
      var comparison, id, query, whereClause, _i, _j, _len, _len1, _ref, _ref1;
      id = 0;
      if (id === 0) {
        query = tree[2].query;
        for (_i = 0, _len = query.length; _i < _len; _i++) {
          whereClause = query[_i];
          if (whereClause[0] === 'Where') {
            _ref = whereClause.slice(1);
            for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
              comparison = _ref[_j];
              if (comparison[0] === "Equals" && ((_ref1 = comparison[1][2]) === 'id' || _ref1 === 'name')) {
                return comparison[2][1];
              }
            }
          }
        }
      }
      return id;
    };
    exports.runURI = runURI = function(method, uri, body, tx, successCallback, failureCallback) {
      var req, res;
      if (body == null) {
        body = {};
      }
      uri = decodeURI(uri);
      console.log('Running URI', method, uri, body);
      req = {
        tree: serverURIParser.match([method, body, uri], 'Process'),
        body: body
      };
      res = {
        send: function(statusCode) {
          if (statusCode === 404) {
            return typeof failureCallback === "function" ? failureCallback() : void 0;
          } else {
            return typeof successCallback === "function" ? successCallback() : void 0;
          }
        },
        json: function(data) {
          return typeof successCallback === "function" ? successCallback(data) : void 0;
        }
      };
      switch (method) {
        case 'GET':
          return runGet(req, res, tx);
        case 'POST':
          return runPost(req, res, tx);
        case 'PUT':
          return runPut(req, res, tx);
        case 'DELETE':
          return runDelete(req, res, tx);
      }
    };
    exports.runGet = runGet = function(req, res, tx) {
      var bindings, clientModel, data, processInstance, query, runQuery, tree, values, _ref;
      processInstance = function(resourceModel, instance) {
        var field, _i, _len, _ref;
        instance = _.clone(instance);
        _ref = resourceModel.fields;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          field = _ref[_i];
          if (field[0] === 'JSON' && instance.hasOwnProperty(field[1])) {
            instance[field[1]] = JSON.parse(instance[field[1]]);
          }
        }
        return instance;
      };
      tree = req.tree;
      if (tree[2] === void 0) {
        return res.json(clientModels[tree[1][1]].resources);
      } else if (tree[2].query != null) {
        _ref = AbstractSQLRules2SQL.match(tree[2].query, 'ProcessQuery'), query = _ref.query, bindings = _ref.bindings;
        values = getAndCheckBindValues(bindings, tree[2].values);
        console.log(query, values);
        if (!_.isArray(values)) {
          return res.json(values, 404);
        } else {
          runQuery = function(tx) {
            return tx.executeSql(query, values, function(tx, result) {
              var clientModel, data, i, resourceModel;
              if (values.length > 0 && result.rows.length === 0) {
                return res.send(404);
              } else {
                clientModel = clientModels[tree[1][1]];
                resourceModel = clientModel.resources[tree[2].resourceName];
                data = {
                  instances: (function() {
                    var _i, _ref1, _results;
                    _results = [];
                    for (i = _i = 0, _ref1 = result.rows.length; 0 <= _ref1 ? _i < _ref1 : _i > _ref1; i = 0 <= _ref1 ? ++_i : --_i) {
                      _results.push(processInstance(resourceModel, result.rows.item(i)));
                    }
                    return _results;
                  })(),
                  model: resourceModel
                };
                return res.json(data);
              }
            }, function() {
              return res.send(404);
            });
          };
          if (tx != null) {
            return runQuery(tx);
          } else {
            return db.transaction(runQuery);
          }
        }
      } else {
        clientModel = clientModels[tree[1][1]];
        data = {
          model: clientModel.resources[tree[2].resourceName]
        };
        return res.json(data);
      }
    };
    exports.runPost = runPost = function(req, res, tx) {
      var bindings, query, runQuery, tree, values, vocab, _ref;
      tree = req.tree;
      if (tree[2] === void 0) {
        return res.send(404);
      } else {
        _ref = AbstractSQLRules2SQL.match(tree[2].query, 'ProcessQuery'), query = _ref.query, bindings = _ref.bindings;
        values = getAndCheckBindValues(bindings, tree[2].values);
        console.log(query, values);
        if (!_.isArray(values)) {
          return res.json(values, 404);
        } else {
          vocab = tree[1][1];
          runQuery = function(tx) {
            tx.begin();
            return tx.executeSql(query, values, function(tx, sqlResult) {
              return validateDB(tx, sqlModels[vocab], function(tx) {
                var insertID;
                tx.end();
                insertID = tree[2].query[0] === 'UpdateQuery' ? values[0] : sqlResult.insertId;
                console.log('Insert ID: ', insertID);
                return res.json({
                  id: insertID
                }, {
                  location: '/' + vocab + '/' + tree[2].resourceName + "?filter=" + tree[2].resourceName + ".id:" + insertID
                }, 201);
              }, function(tx, errors) {
                return res.json(errors, 404);
              });
            }, function() {
              return res.send(404);
            });
          };
          if (tx != null) {
            return runQuery(tx);
          } else {
            return db.transaction(runQuery);
          }
        }
      }
    };
    exports.runPut = runPut = function(req, res, tx) {
      var doValidate, id, insertQuery, queries, runQuery, tree, updateQuery, values, vocab;
      tree = req.tree;
      if (tree[2] === void 0) {
        return res.send(404);
      } else {
        queries = AbstractSQLRules2SQL.match(tree[2].query, 'ProcessQuery');
        if (_.isArray(queries)) {
          insertQuery = queries[0];
          updateQuery = queries[1];
        } else {
          insertQuery = queries;
        }
        values = getAndCheckBindValues(insertQuery.bindings, tree[2].values);
        console.log(insertQuery.query, values);
        if (!_.isArray(values)) {
          return res.json(values, 404);
        } else {
          vocab = tree[1][1];
          doValidate = function(tx) {
            return validateDB(tx, sqlModels[vocab], function(tx) {
              tx.end();
              return res.send(200);
            }, function(tx, errors) {
              return res.json(errors, 404);
            });
          };
          id = getID(tree);
          runQuery = function(tx) {
            tx.begin();
            return tx.executeSql('SELECT NOT EXISTS(\n	SELECT 1\n	FROM "resource" r\n	JOIN "resource-is_under-lock" AS rl ON rl."resource" = r."id"\n	WHERE r."resource_type" = ?\n	AND r."id" = ?\n) AS result;', [tree[2].resourceName, id], function(tx, result) {
              var _ref;
              if ((_ref = result.rows.item(0).result) === false || _ref === 0 || _ref === '0') {
                return res.json(["The resource is locked and cannot be edited"], 404);
              } else {
                return tx.executeSql(insertQuery.query, values, function(tx, result) {
                  return doValidate(tx);
                }, function(tx) {
                  if (updateQuery != null) {
                    values = getAndCheckBindValues(updateQuery.bindings, tree[2].values);
                    console.log(updateQuery.query, values);
                    if (!_.isArray(values)) {
                      return res.json(values, 404);
                    } else {
                      return tx.executeSql(updateQuery.query, values, function(tx, result) {
                        return doValidate(tx);
                      }, function() {
                        return res.send(404);
                      });
                    }
                  } else {
                    return res.send(404);
                  }
                });
              }
            });
          };
          if (tx != null) {
            return runQuery(tx);
          } else {
            return db.transaction(runQuery);
          }
        }
      }
    };
    exports.runDelete = runDelete = function(req, res, tx) {
      var bindings, query, runQuery, tree, values, vocab, _ref;
      tree = req.tree;
      if (tree[2] === void 0) {
        return res.send(404);
      } else {
        _ref = AbstractSQLRules2SQL.match(tree[2].query, 'ProcessQuery'), query = _ref.query, bindings = _ref.bindings;
        values = getAndCheckBindValues(bindings, tree[2].values);
        console.log(query, values);
        if (!_.isArray(values)) {
          return res.json(values, 404);
        } else {
          vocab = tree[1][1];
          runQuery = function(tx) {
            tx.begin();
            return tx.executeSql(query, values, function(tx, result) {
              return validateDB(tx, sqlModels[vocab], function(tx) {
                tx.end();
                return res.send(200);
              }, function(tx, errors) {
                return res.json(errors, 404);
              });
            }, function() {
              return res.send(404);
            });
          };
          if (tx != null) {
            return runQuery(tx);
          } else {
            return db.transaction(runQuery);
          }
        }
      }
    };
    exports.parseURITree = parseURITree = function(req, res, next) {
      var uri;
      if (!(req.tree != null)) {
        try {
          uri = decodeURI(req.url);
          req.tree = serverURIParser.match([req.method, req.body, uri], 'Process');
          console.log(uri, req.tree, req.body);
        } catch (e) {
          console.error('Failed to parse URI tree', req.url, e.message, e.stack);
          req.tree = false;
        }
      }
      if (req.tree === false) {
        return next('route');
      } else {
        return next();
      }
    };
    exports.executeStandardModels = executeStandardModels = function(tx) {
      executeModel(tx, 'dev', devModel, function() {
        return console.log('Sucessfully executed dev model.');
      }, function(tx, error) {
        return console.error('Failed to execute dev model.', error);
      });
      executeModel(tx, 'transaction', transactionModel, function() {
        return console.log('Sucessfully executed transaction model.');
      }, function(tx, error) {
        return console.error('Failed to execute transaction model.', error);
      });
      return executeModel(tx, 'user', userModel, function() {
        runURI('POST', '/user/user', [
          {
            'user.username': 'test',
            'user.password': 'test'
          }
        ], null);
        runURI('POST', '/user/user', [
          {
            'user.username': 'test2',
            'user.password': 'test2'
          }
        ], null);
        return console.log('Sucessfully executed user model.');
      }, function(tx, error) {
        return console.error('Failed to execute user model.', error);
      });
    };
    exports.setup = function(app, requirejs, databaseOptions) {
      db = dbModule.connect(databaseOptions);
      AbstractSQL2SQL = AbstractSQL2SQL[databaseOptions.engine];
      db.transaction(function(tx) {
        executeStandardModels(tx);
        return runURI('GET', '/dev/model?filter=model_type:sql;vocabulary:data', null, tx, function(result) {
          var clientModel, instance, sqlModel, vocab, _i, _len, _ref, _results;
          _ref = result.instances;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            instance = _ref[_i];
            vocab = instance.vocabulary;
            sqlModel = instance.model_value;
            clientModel = AbstractSQL2CLF(sqlModel);
            sqlModels[vocab] = sqlModel;
            serverURIParser.setSQLModel(vocab, sqlModel);
            clientModels[vocab] = clientModel;
            _results.push(serverURIParser.setClientModel(vocab, clientModel));
          }
          return _results;
        });
      });
      app.get('/dev/*', parseURITree, function(req, res, next) {
        return runGet(req, res);
      });
      app.post('/transaction/execute', function(req, res, next) {
        var id;
        id = Number(req.body.id);
        if (_.isNaN(id)) {
          return res.send(404);
        } else {
          return endTransaction(id, function(err) {
            if (err != null) {
              console.error(err);
              return res.json(err, 404);
            } else {
              return res.send(200);
            }
          });
        }
      });
      app.get('/transaction', function(req, res, next) {
        return res.json({
          transactionURI: "/transaction/transaction",
          conditionalResourceURI: "/transaction/conditional_resource",
          conditionalFieldURI: "/transaction/conditional_field",
          lockURI: "/transaction/lock",
          transactionLockURI: "/transaction/lock-belongs_to-transaction",
          resourceURI: "/transaction/resource",
          lockResourceURI: "/transaction/resource-is_under-lock",
          exclusiveLockURI: "/transaction/lock-is_exclusive",
          commitTransactionURI: "/transaction/execute"
        });
      });
      app.get('/transaction/*', parseURITree, function(req, res, next) {
        return runGet(req, res);
      });
      app.post('/transaction/*', parseURITree, function(req, res, next) {
        return runPost(req, res);
      });
      app.put('/transaction/*', parseURITree, function(req, res, next) {
        return runPut(req, res);
      });
      return app.del('/transaction/*', parseURITree, function(req, res, next) {
        return runDelete(req, res);
      });
    };
    return exports;
  });

}).call(this);


/*
To generate a hashed password we can use this line:
password = bcrypt.encrypt_sync(password, bcrypt.gen_salt_sync())

CREATE TABLE users (
	username VARCHAR(50) NOT NULL PRIMARY KEY,
	password CHAR(60) NOT NULL
);
*/


(function() {

  define('cs!passport-bcrypt/passportBCrypt',['bcrypt','passport-local'],function() {
    return function(options, sbvrUtils, app, passport) {
      var LocalStrategy, checkPassword, compare, exports;
      exports = {};
      checkPassword = function(username, password, done) {
        return sbvrUtils.runURI('GET', '/user/user?filter=user.username:' + username, [{}], null, function(data) {
          var hash;
          console.log(data.instances);
          hash = data.instances[0].password;
          return compare(password, hash, function(err, res) {
            if (res) {
              return done(null, username);
            } else {
              return done(null, false);
            }
          });
        }, function(errors) {
          return done(null, false);
        });
      };
      if (passport != null) {
        compare = require('bcrypt').compare;
        LocalStrategy = require('passport-local').Strategy;
        app.post(options.loginUrl, passport.authenticate('local', {
          failureRedirect: options.failureRedirect
        }), function(req, res, next) {
          return res.redirect(options.successRedirect);
        });
        passport.serializeUser(function(user, done) {
          return done(null, user);
        });
        passport.deserializeUser(function(user, done) {
          return done(null, user);
        });
        passport.use(new LocalStrategy(checkPassword));
        exports.isAuthed = function(req, res, next) {
          if (req.isAuthenticated()) {
            return next();
          } else {
            return res.redirect(options.failureRedirect);
          }
        };
      } else {
        compare = function(value, hash, callback) {
          return callback(null, value === hash);
        };
        (function() {
          var _user;
          _user = false;
          app.post(options.loginUrl, function(req, res, next) {
            return checkPassword(req.body.username, req.body.password, function(errors, user) {
              _user = user;
              if (res === false) {
                return res.redirect(options.failureRedirect);
              } else {
                return res.redirect(options.successRedirect);
              }
            });
          });
          return exports.isAuthed = function(req, res, next) {
            console.log('wooo, checking auth');
            if (_user !== false) {
              return next();
            } else {
              return res.redirect(options.failureRedirect);
            }
          };
        })();
      }
      return exports;
    };
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty;

  define('cs!data-server/SBVRServer',['async', 'underscore', 'cs!database-layer/db'], function(async, _, dbModule) {
    var db, exports, isServerOnAir, serverIsOnAir, uiModel, uiModelLoaded;
    exports = {};
    db = null;
    uiModel = 'Term:      Short Text\nTerm:      Long Text\nTerm:      text\n	Concept type: Long Text\nTerm:      name\n	Concept type: Short Text\nTerm:      textarea\n	--Database id Field: name\n	Database Value Field: text\nFact type: textarea is disabled\nFact type: textarea has name\nFact type: textarea has text\nRule:      It is obligatory that each textarea has exactly 1 name\nRule:      It is obligatory that each name is of exactly 1 textarea\nRule:      It is obligatory that each textarea has exactly 1 text';
    isServerOnAir = (function() {
      var onAir, pendingCallbacks;
      onAir = null;
      pendingCallbacks = [];
      return function(funcOrVal) {
        var callback, _i, _len;
        if (funcOrVal === true || funcOrVal === false) {
          onAir = funcOrVal;
          isServerOnAir = function(funcOrVal) {
            if (funcOrVal === true || funcOrVal === false) {
              return onAir = funcOrVal;
            } else {
              return funcOrVal(onAir);
            }
          };
          for (_i = 0, _len = pendingCallbacks.length; _i < _len; _i++) {
            callback = pendingCallbacks[_i];
            callback(onAir);
          }
          return pendingCallbacks = null;
        } else {
          return pendingCallbacks.push(funcOrVal);
        }
      };
    })();
    serverIsOnAir = function(req, res, next) {
      return isServerOnAir(function(onAir) {
        if (onAir) {
          return next();
        } else {
          return next('route');
        }
      });
    };
    uiModelLoaded = (function() {
      var runNext, _nexts;
      _nexts = [];
      runNext = function(next, loaded) {
        var _i, _len, _results;
        if (loaded === true) {
          runNext = function(next) {
            return next();
          };
          _results = [];
          for (_i = 0, _len = _nexts.length; _i < _len; _i++) {
            next = _nexts[_i];
            _results.push(setTimeout(next, 0));
          }
          return _results;
        } else {
          return _nexts.push(next);
        }
      };
      return function(req, res, next) {
        return runNext(next, req);
      };
    })();
    exports.setup = function(app, requirejs, sbvrUtils, isAuthed, databaseOptions) {
      db = dbModule.connect(databaseOptions);
      db.transaction(function(tx) {
        sbvrUtils.executeStandardModels(tx);
        sbvrUtils.executeModel(tx, 'ui', uiModel, function() {
          console.log('Sucessfully executed ui model.');
          return uiModelLoaded(true);
        }, function(tx, error) {
          return console.error('Failed to execute ui model.', error);
        });
        return sbvrUtils.runURI('GET', '/dev/model?filter=model_type:sql;vocabulary:data', null, tx, function(result) {
          return isServerOnAir(true);
        }, function() {
          return isServerOnAir(false);
        });
      });
      app.get('/onair', function(req, res, next) {
        return isServerOnAir(function(onAir) {
          return res.json(onAir);
        });
      });
      app.post('/update', isAuthed, serverIsOnAir, function(req, res, next) {
        return res.send(404);
      });
      app.post('/execute', isAuthed, uiModelLoaded, function(req, res, next) {
        return sbvrUtils.runURI('GET', '/ui/textarea?filter=name:model_area', null, null, function(result) {
          var seModel;
          seModel = result.instances[0].text;
          return db.transaction(function(tx) {
            tx.begin();
            return sbvrUtils.executeModel(tx, 'data', seModel, function(tx, lfModel, slfModel, abstractSqlModel, sqlModel, clientModel) {
              sbvrUtils.runURI('PUT', '/ui/textarea-is_disabled?filter=textarea.name:model_area/', [
                {
                  value: true
                }
              ], tx);
              isServerOnAir(true);
              return res.send(200);
            }, function(tx, errors) {
              return res.json(errors, 404);
            });
          });
        }, function() {
          return res.send(404);
        });
      });
      app.del('/cleardb', isAuthed, function(req, res, next) {
        return db.transaction(function(tx) {
          return tx.tableList(function(tx, result) {
            return async.forEach(result.rows, function(table, callback) {
              return tx.dropTable(table.name, null, function() {
                return callback();
              }, function() {
                return callback(arguments);
              });
            }, function(err) {
              if (err != null) {
                return res.send(404);
              } else {
                sbvrUtils.executeStandardModels(tx);
                sbvrUtils.executeModel(tx, 'ui', uiModel, function() {
                  return console.log('Sucessfully executed ui model.');
                }, function(tx, error) {
                  return console.log('Failed to execute ui model.', error);
                });
                return res.send(200);
              }
            });
          });
        });
      });
      app.put('/importdb', isAuthed, function(req, res, next) {
        var queries;
        queries = req.body.split(";");
        return db.transaction(function(tx) {
          return async.forEach(queries, function(query, callback) {
            query = query.trim();
            if (query.length > 0) {
              return tx.executeSql(query, [], function() {
                return callback();
              }, function(tx, err) {
                return callback([query, err]);
              });
            }
          }, function(err) {
            if (err != null) {
              console.error(err);
              return res.send(404);
            } else {
              return res.send(200);
            }
          });
        });
      });
      app.get('/exportdb', isAuthed, function(req, res, next) {
        var env;
        if (true) {
          env = process.env;
          env['PGPASSWORD'] = '.';
          req = require;
          return req('child_process').exec('pg_dump --clean -U postgres -h localhost -p 5432', {
            env: env
          }, function(error, stdout, stderr) {
            console.log(stdout, stderr);
            return res.json(stdout);
          });
        } else {
          return db.transaction(function(tx) {
            return tx.tableList(function(tx, result) {
              var exported;
              exported = '';
              return async.forEach(result.rows, function(currRow, callback) {
                var tableName;
                tableName = currRow.name;
                exported += 'DROP TABLE IF EXISTS "' + tableName + '";\n';
                exported += currRow.sql + ";\n";
                return tx.executeSql('SELECT * FROM "' + tableName + '";', [], function(tx, result) {
                  var insQuery;
                  insQuery = '';
                  result.rows.forEach(function(currRow) {
                    var notFirst, propName, valQuery;
                    notFirst = false;
                    insQuery += 'INSERT INTO "' + tableName + '" (';
                    valQuery = '';
                    for (propName in currRow) {
                      if (!__hasProp.call(currRow, propName)) continue;
                      if (notFirst) {
                        insQuery += ",";
                        valQuery += ",";
                      } else {
                        notFirst = true;
                      }
                      insQuery += '"' + propName + '"';
                      valQuery += "'" + currRow[propName] + "'";
                    }
                    return insQuery += ") values (" + valQuery + ");\n";
                  });
                  exported += insQuery;
                  return callback();
                }, function(tx, err) {
                  return callback(err);
                });
              }, function(err) {
                if (err != null) {
                  console.error(err);
                  return res.send(404);
                } else {
                  return res.json(exported);
                }
              });
            }, null, "name NOT LIKE '%_buk'");
          });
        }
      });
      app.post('/backupdb', isAuthed, serverIsOnAir, function(req, res, next) {
        return db.transaction(function(tx) {
          return tx.tableList(function(tx, result) {
            return async.forEach(result.rows, function(currRow, callback) {
              var tableName;
              tableName = currRow.name;
              return async.parallel([
                function(callback) {
                  return tx.dropTable(tableName + '_buk', true, function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }, function(callback) {
                  return tx.executeSql('ALTER TABLE "' + tableName + '" RENAME TO "' + tableName + '_buk";', [], function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }
              ], callback);
            }, function(err) {
              if (err != null) {
                console.error(err);
                return res.send(404);
              } else {
                return res.send(200);
              }
            });
          }, function(tx, err) {
            console.error(err);
            return res.send(404);
          }, "name NOT LIKE '%_buk'");
        });
      });
      app.post('/restoredb', isAuthed, serverIsOnAir, function(req, res, next) {
        return db.transaction(function(tx) {
          return tx.tableList(function(tx, result) {
            return async.forEach(result.rows, function(currRow, callback) {
              var tableName;
              tableName = currRow.name;
              return async.parallel([
                function(callback) {
                  return tx.dropTable(tableName.slice(0, -4), true, function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }, function(callback) {
                  return tx.executeSql('ALTER TABLE "' + tableName + '" RENAME TO "' + tableName.slice(0, -4) + '";', [], function() {
                    return callback();
                  }, function(tx, err) {
                    return callback(err);
                  });
                }
              ], callback);
            }, function(err) {
              if (err != null) {
                console.error(err);
                return res.send(404);
              } else {
                return res.send(200);
              }
            });
          }, function(tx, err) {
            console.error(err);
            return res.send(404);
          }, "name LIKE '%_buk'");
        });
      });
      app.get('/ui/*', uiModelLoaded, sbvrUtils.parseURITree, function(req, res, next) {
        return sbvrUtils.runGet(req, res);
      });
      app.get('/data/*', serverIsOnAir, sbvrUtils.parseURITree, function(req, res, next) {
        return sbvrUtils.runGet(req, res);
      });
      app.post('/data/*', serverIsOnAir, sbvrUtils.parseURITree, function(req, res, next) {
        return sbvrUtils.runPost(req, res);
      });
      app.put('/ui/*', uiModelLoaded, sbvrUtils.parseURITree, function(req, res, next) {
        return sbvrUtils.runPut(req, res);
      });
      app.put('/data/*', serverIsOnAir, sbvrUtils.parseURITree, function(req, res, next) {
        return sbvrUtils.runPut(req, res);
      });
      app.del('/data/*', serverIsOnAir, sbvrUtils.parseURITree, function(req, res, next) {
        return sbvrUtils.runDelete(req, res);
      });
      return app.del('/', uiModelLoaded, serverIsOnAir, function(req, res, next) {
        sbvrUtils.runURI('DELETE', '/ui/textarea-is_disabled?filter=textarea.name:model_area/');
        sbvrUtils.runURI('PUT', '/ui/textarea?filter=name:model_area/', [
          {
            text: ''
          }
        ]);
        sbvrUtils.deleteModel('data');
        isServerOnAir(false);
        return res.send(200);
      });
    };
    return exports;
  });

}).call(this);

(function() {

  define('cs!editor-server/editorServer',['require','exports','module'],function(requirejs, exports, module) {
    var db, decodeBase, toBase;
    db = null;
    toBase = function(decimal, base) {
      var chars, symbols;
      symbols = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      chars = "";
      if (base > symbols.length || base <= 1) {
        return false;
      }
      while (decimal >= 1) {
        chars = symbols[decimal - (base * Math.floor(decimal / base))] + chars;
        decimal = Math.floor(decimal / base);
      }
      return chars;
    };
    decodeBase = function(url, base) {
      var alphaChar, alphaNum, sum, symbols, _i, _len, _ref;
      symbols = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      sum = 0;
      _ref = url.split("");
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        alphaChar = _ref[_i];
        alphaNum = alphaChar.charCodeAt(0);
        if (48 <= alphaNum && alphaNum <= 57) {
          alphaNum -= 48;
        } else if (65 <= alphaNum && alphaNum <= 90) {
          alphaNum -= 29;
        } else if (97 <= alphaNum && alphaNum <= 122) {
          alphaNum -= 87;
        } else {
          return false;
        }
        sum *= base;
        sum += alphaNum;
      }
      return sum;
    };
    exports.setup = function(app, requirejs, sbvrUtils, isAuthed, databaseOptions) {
      requirejs(['cs!database-layer/db'], function(dbModule) {
        db = dbModule.connect(databaseOptions);
        return db.transaction(function(tx) {
          return tx.tableList(function(tx, result) {
            if (result.rows.length === 0) {
              return tx.executeSql('CREATE TABLE ' + '"_sbvr_editor_cache" (' + '"id" INTEGER PRIMARY KEY AUTOINCREMENT,' + '"value" TEXT );');
            }
          }, null, "name = '_sbvr_editor_cache'");
        });
      });
      app.post('/publish', function(req, res, next) {
        return db.transaction(function(tx) {
          var lfmod, value;
          try {
            lfmod = SBVRParser.matchAll(req.body, "Process");
          } catch (e) {
            console.log('Error parsing model', e);
            res.json('Error parsing model');
            return null;
          }
          value = JSON.stringify(req.body);
          return tx.executeSql('INSERT INTO "_sbvr_editor_cache" ("value") VALUES (?);', [value], function(tx, result) {
            return res.json(toBase(result.insertId, 62));
          }, function(tx, error) {
            return res.json(error);
          });
        });
      });
      return app.get('/publish/:key', function(req, res, next) {
        var key;
        key = decodeBase(req.params.key, 62);
        if (key === false) {
          return res.send(404);
        } else {
          console.log('key: ', key);
          return db.transaction(function(tx) {
            return tx.executeSql('SELECT * FROM "_sbvr_editor_cache" WHERE id = ?;', [key], function(tx, result) {
              if (result.rows.length === 0) {
                return res.json("Error");
              } else {
                return res.send(result.rows.item(0).value);
              }
            }, function(tx, error) {
              return res.json(error);
            });
          });
        }
      });
    };
    return exports;
  });

}).call(this);

(function() {
  var __slice = [].slice;

  define('cs!express-emulator/express',['require','exports','module'],function(requirejs, exports, module) {
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
          if (body == null) {
            body = '';
          }
          if (!handlers[method]) {
            failureCallback(404);
          }
          req = {
            method: method,
            body: body,
            headers: headers,
            url: uri,
            params: {}
          };
          console.log(method, uri, body);
          if (uri.slice(-1) === '/') {
            uri = uri.slice(0, uri.length - 1);
          }
          uri = uri.toLowerCase();
          res = {
            json: function(obj, headers, statusCode) {
              var _ref;
              if (headers == null) {
                headers = 200;
              }
              if (typeof headers === 'number' && !(statusCode != null)) {
                _ref = [headers, {}], statusCode = _ref[0], headers = _ref[1];
              }
              obj = JSON.parse(JSON.stringify(obj));
              if (statusCode === 404) {
                return failureCallback(statusCode, obj, headers);
              } else {
                return successCallback(statusCode, obj, headers);
              }
            },
            send: function(statusCode, headers) {
              if (statusCode === 404) {
                return failureCallback(statusCode, null, headers);
              } else {
                return successCallback(statusCode, null, headers);
              }
            },
            redirect: function() {
              return failureCallback(307);
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

(function() {

  define('cs!server-glue/server',['has', 'cs!server-glue/sbvr-utils', 'cs!passport-bcrypt/passportBCrypt', 'cs!data-server/SBVRServer', 'cs!editor-server/editorServer', 'cs!express-emulator/express'], function(has, sbvrUtils, passportBCrypt, sbvrServer, editorServer, express) {
    var app, databaseOptions, passport, setupCallback;
    if (true) {
      if (true) {
        databaseOptions = {
          engine: 'mysql',
          params: process.env.DATABASE_URL || {
            host: 'localhost',
            user: 'root',
            password: '1234',
            database: 'rulemotion'
          }
        };
      } else if (false) {
        databaseOptions = {
          engine: 'postgres',
          params: process.env.DATABASE_URL || "postgres://postgres:.@localhost:5432/postgres"
        };
      } else {
        throw 'What database do you want??';
      }
    } else {
      databaseOptions = {
        engine: 'websql',
        params: 'rulemotion'
      };
    }
    setupCallback = function(app) {
      sbvrUtils.setup(app, require, databaseOptions);
      passportBCrypt = passportBCrypt({
        loginUrl: '/login',
        failureRedirect: '/login.html',
        successRedirect: '/'
      }, sbvrUtils, app, passport);
      if (true) {
        sbvrServer.setup(app, require, sbvrUtils, passportBCrypt.isAuthed, databaseOptions);
      }
      if (true) {
        editorServer.setup(app, require, sbvrUtils, passportBCrypt.isAuthed, databaseOptions);
      }
      if (true) {
        return app.listen(process.env.PORT || 1337, function() {
          return console.log('Server started');
        });
      }
    };
    if (true) {
      express = require('express');
      passport = require('passport');
      app = express();
      app.configure(function() {
        app.use(express.cookieParser());
        app.use(express.bodyParser());
        app.use(express.session({
          secret: "A pink cat jumped over a rainbow"
        }));
        app.use(passport.initialize());
        app.use(passport.session());
        return app.use(function(req, res, next) {
          var origin;
          origin = req.get("Origin") || "*";
          res.header('Access-Control-Allow-Origin', origin);
          res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS, HEAD');
          res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Application-Record-Count');
          res.header('Access-Control-Allow-Credentials', 'true');
          return next();
        });
      });
      return setupCallback(app);
    } else {
      if (false) {
        if (typeof window !== "undefined" && window !== null) {
          window.remoteServerRequest = express.app.process;
        }
        return setupCallback(express.app);
      }
    }
  });

}).call(this);

require = require('requirejs')

require({
	config: {
		has: {
			ENV_NODEJS              :  true,
			SBVR_SERVER_ENABLED     :  true,
			EDITOR_SERVER_ENABLED   :  true,
			BROWSER_SERVER_ENABLED  :  false,
			USE_MYSQL               :  true,
			USE_POSTGRES            :  false,
			DEV                     :  false
		}
	},
	paths: {
		//Developing & building tools
		'cs'              :  '../../tools/requirejs-plugins/cs',
		'ometa'           :  '../../tools/requirejs-plugins/ometa',
		'text'            :  '../../tools/requirejs-plugins/text',
		'coffee-script'   :  '../../tools/coffee-script',
		'has'             :  '../../tools/has',

		//Libraries
		'ometa-compiler'  :  '../../external/ometa-js/lib/ometajs/ometa/parsers',
		'ometa-core'      :  '../../external/ometa-js/lib/ometajs/core',
		'sbvr-parser'     :  '../../common/sbvr-parser',
		'utils'           :  '../../common/utils',
		'Prettify'        :  '../../common/Prettify',
		'inflection'      :  '../../external/inflection/inflection',
	},
	shim: {
		'ometa-compiler': {
			deps: ['ometa-core']
		}
	}
}, ['cs!server-glue/server']);

define("main", function(){});
}());