define(["ometa-base"], (function() {
    {
        var SBVR_NullOpt = undefined;
        var SBVR2SQLPrep = undefined;
        var FNN_Elim = undefined;
        var SBVR_PreProc = undefined
    };
    SBVR_NullOpt = objectThatDelegatesTo(OMeta, {
        "$": function(x) {
            var $elf = this,
                _fromIdx = this.input.idx,
                a;
            return this._or((function() {
                a = this._applyWithArgs("token", x);
                return [a]
            }), (function() {
                return []
            }))
        },
        "trans": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                t, a;
            this._form((function() {
                t = this._apply("anything");
                return a = this._applyWithArgs("apply", t)
            }));
            return a
        },
        "token": function(x) {
            var $elf = this,
                _fromIdx = this.input.idx,
                t, a;
            this._form((function() {
                t = this._apply("anything");
                this._pred((t == x));
                return a = this._applyWithArgs("apply", x)
            }));
            return a
        },
        "letters": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                l;
            l = this._many1((function() {
                return this._apply("letter")
            }));
            this._many((function() {
                return this._apply("space")
            }));
            return l.join("")
        },
        "num": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                n;
            n = this._apply("number");
            this._pred((!isNaN(n)));
            return ["num", parseInt(n)]
        },
        "model": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                xs;
            xs = this._many((function() {
                return this._or((function() {
                    return this._applyWithArgs("token", "term")
                }), (function() {
                    return this._applyWithArgs("token", "fcTp")
                }), (function() {
                    return this._applyWithArgs("token", "rule")
                }))
            }));
            return ["model"].concat(xs)
        },
        "fcTp": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                t, v, e;
            (a = []);
            this._many((function() {
                t = this._applyWithArgs("token", "term");
                v = this._applyWithArgs("token", "verb");
                return (a = a.concat([t, v]))
            }));
            e = this._applyWithArgs("$", "term");
            return this._applyWithArgs("addAttributes", ["fcTp"].concat(a).concat(e))
        },
        "term": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                t;
            t = this._apply("anything");
            return this._applyWithArgs("addAttributes", ["term", t])
        },
        "verb": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                v;
            v = this._apply("anything");
            return ["verb", v]
        },
        "rule": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                x, t;
            x = this._or((function() {
                return this._applyWithArgs("token", "obl")
            }), (function() {
                return this._applyWithArgs("token", "nec")
            }), (function() {
                return this._applyWithArgs("token", "pos")
            }), (function() {
                return this._applyWithArgs("token", "prm")
            }));
            t = this._applyWithArgs("token", "text");
            return ["rule", x, t]
        },
        "addAttributes": function(termOrVerb) {
            var $elf = this,
                _fromIdx = this.input.idx,
                attrs, attrsFound, attrName, attrVal;
            this._or((function() {
                return this._apply("end")
            }), (function() {
                attrs = [];
                attrsFound = ({});
                this._form((function() {
                    return this._or((function() {
                        return this._apply("end")
                    }), (function() {
                        return attrs = this._many((function() {
                            this._form((function() {
                                attrName = this._apply("anything");
                                (attrsFound[attrName] = true);
                                return this._or((function() {
                                    this._pred(this[("attr" + attrName)]);
                                    return attrVal = this._applyWithArgs("apply", ("attr" + attrName))
                                }), (function() {
                                    return attrVal = this._apply("anything")
                                }))
                            }));
                            return [attrName, attrVal]
                        }))
                    }))
                }));
                return this._applyWithArgs("defaultAttributes", termOrVerb, attrsFound, attrs)
            }));
            return termOrVerb
        },
        "attrDefinition": function() {
            var $elf = this,
                _fromIdx = this.input.idx;
            return this._apply("trans")
        },
        "text": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                a;
            a = this._apply("anything");
            return ["text", a]
        },
        "obl": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                xs;
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["obl"].concat(xs)
        },
        "nec": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                xs;
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["nec"].concat(xs)
        },
        "pos": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                xs;
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["pos"].concat(xs)
        },
        "prm": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                xs;
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["prm"].concat(xs)
        },
        "neg": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                xs;
            xs = this._apply("trans");
            return ["neg"].concat([xs])
        },
        "quant": function() {
            var $elf = this,
                _fromIdx = this.input.idx;
            return this._or((function() {
                return this._applyWithArgs("token", "univQ")
            }), (function() {
                return this._applyWithArgs("token", "existQ")
            }), (function() {
                return this._applyWithArgs("token", "exactQ")
            }), (function() {
                return this._applyWithArgs("token", "atMostQ")
            }), (function() {
                return this._applyWithArgs("token", "atLeastQ")
            }), (function() {
                return this._applyWithArgs("token", "numRngQ")
            }))
        },
        "univQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                v, xs;
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["univQ", v].concat(xs)
        },
        "existQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                v, xs;
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["existQ", v].concat(xs)
        },
        "exactQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                i, v, xs;
            i = this._applyWithArgs("token", "card");
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["exactQ", i, v].concat(xs)
        },
        "atMostQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                a, v, xs;
            a = this._applyWithArgs("token", "maxCard");
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["atMostQ", a, v].concat(xs)
        },
        "atLeastQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                i, v, xs;
            i = this._applyWithArgs("token", "minCard");
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["atLeastQ", i, v].concat(xs)
        },
        "numRngQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                i, a, v, xs;
            i = this._applyWithArgs("token", "minCard");
            a = this._applyWithArgs("token", "maxCard");
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            return ["numRngQ", i, a, v].concat(xs)
        },
        "card": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                n;
            n = this._applyWithArgs("token", "num");
            return ["card", n]
        },
        "minCard": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                n;
            n = this._applyWithArgs("token", "num");
            return ["minCard", n]
        },
        "maxCard": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                n;
            n = this._applyWithArgs("token", "num");
            return ["maxCard", n]
        },
        "var": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                n, t, w;
            return this._or((function() {
                n = this._applyWithArgs("token", "num");
                t = this._applyWithArgs("token", "term");
                w = this._or((function() {
                    return this._applyWithArgs("token", "aFrm")
                }), (function() {
                    return this._apply("quant")
                }));
                return ["var", n, t, w]
            }), (function() {
                n = this._applyWithArgs("token", "num");
                t = this._applyWithArgs("token", "term");
                return ["var", n, t]
            }))
        },
        "bind": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                t, n;
            t = this._applyWithArgs("token", "term");
            n = this._apply("number");
            return ["bind", t, n]
        },
        "aFrm": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                f, b;
            f = this._applyWithArgs("token", "fcTp");
            b = this._many((function() {
                return this._applyWithArgs("token", "bind")
            }));
            return ["aFrm", f].concat(b)
        }
    });
    (SBVR_NullOpt["defaultAttributes"] = (function(termOrVerb, attrsFound, attrs) {
        termOrVerb.push(attrs)
    }));
    SBVR2SQLPrep = objectThatDelegatesTo(SBVR_NullOpt, {});
    (SBVR2SQLPrep["defaultAttributes"] = (function(termOrVerb, attrsFound, attrs) {
        if ((!attrsFound.hasOwnProperty("DatabaseIDField"))) {
            attrs.push(["DatabaseIDField", "id"])
        } else {
            undefined
        };
        switch (termOrVerb[(0)]) {
        case "term":
            {
                if ((!attrsFound.hasOwnProperty("DatabaseNameField"))) {
                    attrs.push(["DatabaseNameField", "name"])
                } else {
                    undefined
                }
                if ((!attrsFound.hasOwnProperty("DatabaseTableName"))) {
                    attrs.push(["DatabaseTableName", termOrVerb[(1)].replace(new RegExp(" ", "g"), "_")])
                } else {
                    undefined
                }
                break
            };
        case "fcTp":
            {
                if ((!attrsFound.hasOwnProperty("DatabaseTableName"))) {
                    var tableName = termOrVerb[(1)][(1)].replace(new RegExp(" ", "g"), "_");
                    for (var i = (2);
                    (i < termOrVerb["length"]); i++) {
                        (tableName += ("-" + termOrVerb[i][(1)].replace(new RegExp(" ", "g"), "_")))
                    };
                    attrs.push(["DatabaseTableName", tableName])
                } else {
                    undefined
                }
                break
            }
        };
        termOrVerb.push(attrs)
    }));
    FNN_Elim = objectThatDelegatesTo(SBVR_NullOpt, {
        "setHelped": function() {
            var $elf = this,
                _fromIdx = this.input.idx;
            return ($elf["_didSomething"] = true)
        },
        "helped": function() {
            var $elf = this,
                _fromIdx = this.input.idx;
            return this._pred($elf["_didSomething"])
        },
        "optimize": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                x;
            x = this._apply("trans");
            this._apply("helped");
            return x
        },
        "univQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                v, xs;
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            this._apply("setHelped");
            return ["neg", ["existQ", v, ["neg"].concat(xs)]]
        },
        "atLeastQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                i, v, xs;
            return this._or((function() {
                i = this._applyWithArgs("token", "minCard");
                this._pred((i[(1)][(1)] == (1)));
                v = this._applyWithArgs("token", "var");
                xs = this._many((function() {
                    return this._apply("trans")
                }));
                this._apply("setHelped");
                return ["existQ", v].concat(xs)
            }), (function() {
                i = this._applyWithArgs("token", "minCard");
                v = this._applyWithArgs("token", "var");
                xs = this._many((function() {
                    return this._apply("trans")
                }));
                return ["atLeastQ", i, v].concat(xs)
            }))
        },
        "atMostQ": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                a, v, xs;
            a = this._applyWithArgs("token", "maxCard");
            v = this._applyWithArgs("token", "var");
            xs = this._many((function() {
                return this._apply("trans")
            }));
            this._apply("setHelped");
            return (function() {
                a[(1)][(1)]++;
                return ["neg", ["atLeastQ", ["minCard", a[(1)]], v].concat(xs)]
            }).call(this)
        },
        "neg": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                xs;
            return this._or((function() {
                this._form((function() {
                    this._applyWithArgs("exactly", "neg");
                    return xs = this._apply("trans")
                }));
                this._apply("setHelped");
                return xs
            }), (function() {
                return SBVR_NullOpt._superApplyWithArgs(this, 'neg')
            }))
        }
    });
    (FNN_Elim["initialize"] = (function() {
        (this["_didSomething"] = false)
    }));
    SBVR_PreProc = objectThatDelegatesTo(OMeta, {
        "optimizeTree": function() {
            var $elf = this,
                _fromIdx = this.input.idx,
                r;
            r = this._apply("anything");
            this._many((function() {
                return r = this._applyWithArgs("foreign", FNN_Elim, 'optimize', r)
            }));
            r = this._applyWithArgs("foreign", SBVR2SQLPrep, 'trans', r);
            return r
        }
    });
    return SBVR_PreProc
}))