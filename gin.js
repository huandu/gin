/*!
 * gin HTML5 Game Engine v1.1.0 dev
 * https://github.com/huandu/gin/
 *
 * Copyright 2011, Huan Du
 * Licensed under the MIT license
 * https://github.com/huandu/gin/blob/master/LICENSE
 */

/*#{{
replace /GinToolkit\.debug\(/ //GinToolkit.debug(
replace /GinToolkit\.error\(/ //GinToolkit.error(
replace /GinToolkit\.assert\(/ //GinToolkit.assert(
}}#*/

(function(window, undefined){
var GIN_FPS_DEFAULT = 30,
    GIN_FPS_MIN = 1,
    GIN_FPS_MAX = 100,

    GIN_STATE_INIT = 1,
    GIN_STATE_STARTED = 2,
    GIN_STATE_PAUSED = 3,
    GIN_STATE_STOPPED = 4,

    GIN_MOUSESTATE_MOVE = 1,
    GIN_MOUSESTATE_DOWN = 2,
    GIN_MOUSESTATE_UP = 3,

    GIN_INTERVAL_TOLERANCE = 5,

    GIN_RESIZE_INTERVAL = 100,

    GIN_REGEXP_NAME = /^[a-zA-Z_\-][a-zA-Z_0-9\-]*$/,
    GIN_REGEXP_BLANK = /\s+/,
    GIN_REGEXP_NUMBER = /^-?\d+(\.\d*)?$/,
    
    //GIN_REGEXP_ANDROID = /Android/,
    //GIN_REGEXP_WEBKIT = /AppleWebKit/,
    //GIN_REGEXP_IPHONE = /(iPhone)|(iOS)/,

    GIN_EVENT_MOUSEMOVE_MAX_HISTORY = 300,

    GIN_FUNC_DUMMY = function() {},

    GIN_ZINDEX_EVENT_LAYER = 10000,
    GIN_ZINDEX_DIALOG_LAYER = GIN_ZINDEX_EVENT_LAYER + 1,

    document = window.document,
    
    Class = function(baseClass, extend, staticMethod) {
        var klass = baseClass?
                baseClass.extend({}, true): function() {},
            ext = extend || {},
            i;
        
        if (baseClass) {
            klass = baseClass.extend({}, true);
        } else {
            klass = function() {};
            klass.extend = function(ext, createNewClass) {
                var target = this,
                    i;
                
                if (createNewClass) {
                    target = arguments.callee.call(function() {}, this.prototype);
                    target.extend = this.extend;
                    target.create = this.create;
                }
                
                for (i in ext) {
                    target.prototype[i] = ext[i];
                }
                
                return target;
            };
            klass.create = ext.init || function() {
                return new this();
            };
        }
        
        if (staticMethod) {
            for (i in ext) {
                klass[i] = ext[i];
            }
        } else {
            klass.extend(ext);
        }
        
        return klass;
    },
    
    /** @class */
    GinToolkit = Class(null, (function() {
        var _logger = function(logger, args) {
            try {
                console[logger].apply(console, args);
            } catch (e) {
                // workaround for IE9
                try {
                    var i = 0,
                        arr = [];
                    for (; i < args.length; i++) {
                        arr.push(args[i]);
                    }
                    
                    console[logger](arr.join(' '));
                } catch (e) {
                }
            }
        };

        return /** @lends GinToolkit */{
            debug: function() {
                _logger('info', arguments);
            },

            error: function() {
                _logger('error', arguments);
            },
            
            assert: function(expr, text) {
                if (!expr) {
                    _logger('error', 'assertion failed!', text);
                    throw new Error('assertion failed! '+ text);
                }
            },

            getSetting: function(value, defValue, regexp, action) {
                var r = regexp instanceof RegExp? regexp: null,
                    a = action instanceof Function? action:
                    regexp instanceof Function? regexp:
                    function(value) {return value;},
                    val = undefined;
                
                if (value !== undefined && (!r || r.test(value))) {
                    val = a(value);
                }
                
                return val === undefined? defValue: val;
            },

            parseListener: function(listeners, item) {
                if (listeners[item] instanceof Function) {
                    return listeners[item];
                }
                
                return GIN_FUNC_DUMMY;
            },
            
            setFriendMethod: function(caller, callee) {
                caller._friends = caller._friends || [];
                caller._friends.push(callee.toString());
                return caller;
            },

            verifyFriendMethod: function(args) {
                try {
                    var callee = args.callee,
                        caller = callee.caller,
                        calleeString = callee.toString(),
                        friends = caller._friends,
                        i;
                    
                    if (!caller || !caller._friends) {
                        return false;
                    }
                    
                    for (i in friends) {
                        if (friends[i] === calleeString) {
                            return true;
                        }
                    }
                    
                    return false;
                } catch (e) {
                    return false;
                }
            },

            emptyObject: function(obj) {
                for (var i in obj) {
                    return false;
                }
                
                return true;
            }
        };
    })(), true),
    
    GinCore = Class(null, (function() {
        var _callListener = function(eventName, e) {
            var pool = this._.listeners[eventName],
                layer = this._.layer,
                i;
            
            if (!pool) {
                return this;
            }
            
            for (i in pool) {
                pool[i].call(layer, e);
            }
            
            return this;
        };
        
        return /** @lends GinCore.prototype */ {
            /** @constructs */
            init: function(id, settings, listeners) {
                if (!id) {
                    GinToolkit.error('id cannot be empty');
                    return;
                }
                
                var s = settings || {},
                    h = listeners || {},
                    now = Date.now(),
                    gin = new this(),
                    element, layer, receiver, data, style;
                
                if (id.nodeType) {
                    element = id;
                } else if (typeof id === 'string') {
                    element = document.getElementById(id);
                    
                    if (!element) {
                        GinToolkit.error('cannot find element by id. [id: ' + id + ']');
                        return;
                    }
                } else {
                    GinToolkit.error('invalid id. [id: ' + id.toString() + ']');
                    return;
                }
                
                // receiver is the div receive all keyboard/mouse events
                receiver = document.createElement('div');
                receiver._ = {core: gin};
                
               // initialize gin attributes.
                data = gin._ = {
                    element: element,
                    receiver: receiver,
                    state: GIN_STATE_INIT,
                    framePrepared: false,
                    lastResize: now,
                    hasFocus: true,
                    cachedEvent: {
                        isOld: true,
                    },
                    listener: GinListener.create(gin),
                    stats: {
                        frameCount: 0,
                        mousemoveCount: 0,
                        fps: 0,
                        mps: 0,
                        frameCountInSecond: 0,
                        lastTime: now
                    },
                    statsReader: function(key) {
                        return gin._.stats[key];
                    },
                    fps: GinToolkit.getSetting(s.fps, GIN_FPS_DEFAULT, GIN_REGEXP_NUMBER, function(value) {
                        if (value < GIN_FPS_MIN || value > GIN_FPS_MAX) {
                            GinToolkit.error('fps setting must in range of [' + GIN_FPS_MIN + ', ' + GIN_FPS_MAX + ']. '
                                + '[fps: ' + value + ']');
                            return;
                        }
                        
                        return value;
                    }),
                    width: GinToolkit.getSetting(s.width, element.clientWidth, GIN_REGEXP_NUMBER, function(value) {
                        if (value <= 0) {
                            return;
                        }
                        
                        element.style.width = value + 'px';
                        element.width = value;
                        return value;
                    }),
                    height: GinToolkit.getSetting(s.height, element.clientHeight, GIN_REGEXP_NUMBER, function(value) {
                        if (value <= 0) {
                            return;
                        }
                        
                        element.style.height = value + 'px';
                        element.height = value;
                        return value;
                    }),
                    autoPause: GinToolkit.getSetting(s.autoPause, false, function(value) {
                        return value === true? value: undefined;
                    }),
                    listeners: {
                        ginstart: [],
                        ginpause: [],
                        ginstop: [],
                        ginrestart: [],
                        ginblur: [],
                        ginfocus: [],
                        ginsize: []
                    }
                };
                
                data.interval = 1000. / data.fps;
                
                // init event listener layer
                style = receiver.style;
                style.position = 'absolute';
                style.left = 0;
                style.top = 0;
                style.width = data.width + 'px';
                style.height = data.height + 'px';
                style.zIndex = GIN_ZINDEX_EVENT_LAYER;
                style.outline = 0;
                receiver.tabIndex = 1;
                element.appendChild(receiver);
                receiver.focus();
                
                data.listener.bind(receiver);
                
                // create root layer. it's the parent of any other layers.
                layer = GinLayer.create({
                    width: data.width,
                    height: data.height,
                    left: 0,
                    top: 0,
                    core: gin,
                    name: 'root',
                    parent: null,
                    parentElement: element
                }, {
                    start: GinToolkit.parseListener(h, 'start'),
                    play: GinToolkit.parseListener(h, 'play'),
                    stop: GinToolkit.parseListener(h, 'stop'),
                    beforerender: GinToolkit.parseListener(h, 'beforerender'),
                    render: GinToolkit.parseListener(h, 'render'),
                    size: GinToolkit.parseListener(h, 'size'),
                    destroy: function() {
                        gin.stop();
                    }
                });
                
                if (!layer) {
                    GinToolkit.error('cannot create default layer instance');
                    return;
                }
                
                // register gin* event handlers
                gin.register(h);
                
                // only this.resize is able to change root layer's width/height.
                // TODO: refactory this
                GinToolkit.setFriendMethod(gin.resize, layer.width);
                GinToolkit.setFriendMethod(gin.resize, layer.height);
                data.layer = layer;
                
                if (GinToolkit.getSetting(s.autoStart, true, function(value) {
                    return value === false? value: undefined;
                })) {
                    gin.start();
                }
                
                return gin;
            },
        
            start: function() {
                var data = this._;
                
                if (data.state == GIN_STATE_STARTED) {
                    return this;
                }
                
                if (data.state != GIN_STATE_INIT && data.state != GIN_STATE_STOPPED
                    && data.state != GIN_STATE_PAUSED) {
                    GinToolkit.error('only GIN_STATE_INIT, GIN_STATE_STOPPED and GIN_STATE_PAUSED can be started.'
                        + ' [state: ' + data.state + ']');
                    return this;
                }
                
                data.timer = window.setInterval((function(self) {
                    var _updateEventStats = function(stats, now) {
                        var currentSecond = Math.floor(now / 1000),
                            lastSecond = Math.floor(stats.lastTime / 1000);
                        
                        if (currentSecond != lastSecond && stats.frameCountInSecond) {
                            stats.fps = stats.frameCountInSecond;
                            stats.mps = stats.mousemoveCount;
                            stats.frameCountInSecond = 0;
                            stats.mousemoveCount = 0;
                        }
                    };
                    
                    return function() {
                        var now = Date.now(),
                            data = self._,
                            fps = data.fps,
                            stats = data.stats,
                            layer = data.layer,
                            history = data.listener.history();
                        
                        _updateEventStats.call(data, stats, now);
                        
                        // frame rendered in 1s must be always lower than fps in setting.
                        if (stats.frameCountInSecond >= fps && data.framePrepared) {
                            return;
                        }
                        
                        // gin user should put all code independent of canvas context in beforerender handler.
                        // doing this can make best use of client cpu.
                        if (!data.framePrepared) {
                            // clear event cache
                            data.cachedEvent.isOld = true;
                            
                            layer.beforerender();
                            history.clear(true);
                            data.framePrepared = true;
                        }
                        
                        now = Date.now();
                        _updateEventStats.call(data, stats, now);
                        
                        // start rendering if it's time to do it.
                        if (!stats.frameCountInSecond
                            || (now % 1000) - stats.frameCountInSecond * data.interval + GIN_INTERVAL_TOLERANCE >= 0) {
                            
                            // clear event cache
                            data.cachedEvent.isOld = true;
                            
                            layer.render();
                            history.clear(true);

                            if (now - data.lastResize > GIN_RESIZE_INTERVAL) {
                                self.resize();
                                data.lastResize = now;
                            }
                            
                            layer.updateStyle();
                            
                            stats.frameCount++;
                            stats.frameCountInSecond++;
                            stats.lastTime = now;
                            data.framePrepared = false;
                        }
                    }
                })(this), 1);
                
                data.state = GIN_STATE_STARTED;
                _callListener.call(this, 'ginstart');
                
                data.layer.play();
                GinToolkit.debug('gin is started');
                
                return this;
            },
            pause: function() {
                var data = this._;
                
                if (data.state == GIN_STATE_PAUSED) {
                    return this;
                }
                
                if (data.state != GIN_STATE_STARTED) {
                    GinToolkit.error('only GIN_STATE_STARTED can be started. [state: ' + data.state + ']');
                    return this;
                }
                
                data.state = GIN_STATE_PAUSED;
                _callListener.call(this, 'ginpause');
                
                data.layer.stop();
                GinToolkit.debug('gin is paused');
                
                return this;
            },
            stop: function() {
                var data = this._;
                
                if (data.state == GIN_STATE_STOPPED) {
                    return this;
                }
                
                if (data.state != GIN_STATE_STARTED && data.state != GIN_STATE_PAUSED) {
                    GinToolkit.error('only GIN_STATE_STARTED and GIN_STATE_PAUSED can be stopped.'
                        + ' [state: ' + data.state + ']');
                    return this;
                }
                
                if (data.timer) {
                    window.clearInterval(data.timer);
                    data.timer = 0;
                }
                
                data.state = GIN_STATE_STOPPED;
                _callListener.call(this, 'ginstop');
                
                data.layer.stop();
                GinToolkit.debug('gin is stopped');
                
                return this;
            },
            restart: function() {
                var data = this._;
                
                if (data.state != GIN_STATE_STARTED && data.state != GIN_STATE_PAUSED) {
                    GinToolkit.error('only GIN_STATE_STARTED and GIN_STATE_PAUSED can be restarted.'
                        + ' [state: ' + data.state + ']');
                    return this;
                }
                
                _callListener.call(this, 'ginrestart');
                
                this.stop();
                this.start();
                return this;
            },
            blur: function() {
                var data = this._;
                
                if (data.hasFocus) {
                    data.hasFocus = false;
                    _callListener.call(this, 'ginblur');
                    
                    if (data.autoPause) {
                        this.pause();
                    }
                }
            },
            focus: function() {
                var data = this._;
               
                if (!data.hasFocus) {
                    data.receiver.focus();  
                    data.hasFocus = true;
                    _callListener.call(this, 'ginfocus');
                    
                    if (data.autoPause) {
                        this.start();
                    }
                }
            },
            resize: function(width, height) {
                var data = this._,
                    element = data.element,
                    w = width || element.clientWidth,
                    h = height || element.clientHeight,
                    receiver = data.receiver,
                    layer = data.layer,
                    needResize = false;
                
                if (isNaN(w) || w < 0 || isNaN(h) || h < 0) {
                    GinToolkit.error('invalid width or height');
                    return this;
                }
                
                if (w != data.width) {
                    needResize = true;
                    data.width = w;
                    receiver.style.width = w + 'px';
                    layer.width(w);
                    
                    if (w != element.clientWidth) {
                        element.style.width = w + 'px';
                        element.width = w;
                    }
                }
                
                if (h != data.height) {
                    needResize = true;
                    data.height = h;
                    receiver.style.height = h + 'px';
                    layer.height(h);
                    
                    if (h != element.clientHeight) {
                        element.style.height = h + 'px';
                        element.height = h;
                    }
                }
                
                if (needResize) {
                    _callListener.call(this, 'ginsize');
                }
            },
            width: function() {
                return this._.width;
            },
            height: function() {
                return this._.height;
            },
            event: function(offsetX, offsetY) {
                var data = this._,
                    cache = data.cachedEvent,
                    e = cache.e;
                
                if (cache.isOld) {
                    e = data.listener.event();
                    e.stats = data.statsReader;
                    
                    cache = data.cachedEvent = {
                        e: e,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        isOld: false
                    };
                }
                
                e.offsetX = offsetX;
                e.offsetY = offsetY;
                e.clientX = cache.clientX - offsetX;
                e.clientY = cache.clientY - offsetY;
                return e;
            },
            register: function(eventName, listener) {
                var listeners = this._.listeners,
                    pool, i;
                
                if (typeof eventName == 'object') {
                    for (i in eventName) {
                        arguments.callee.call(this, i, eventName[i]);
                    }
                    
                    return this;
                }
                
                pool = listeners[eventName];
                
                if (pool === undefined) {
                    return this;
                }
                
                if (!(listener instanceof Function)) {
                    GinToolkit.error('listener must be a function');
                    return this;
                }
                
                pool.push(listener);
                return this;
            },
            unregister: function(eventName, listener) {
                var listeners = this._.listeners,
                    pool = listeners[eventName],
                    i;
                
                if (pool === undefined) {
                    GinToolkit.error('unknown event name [event: ' + eventName + ']');
                    return this;
                }
                
                for (i in pool) {
                    if (pool[i] === listener) {
                        delete pool[i];
                    }
                }
                
                return this;
            }
        };
    })()),

    GinListener = Class(null, (function() {
        var _keyboardHandler = function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            this.set({
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey
            })
            .keyState(e.keyCode, e.type === 'keydown');
        },

        _mousemoveHandler = function(e) {
            this.add(e);
        },

        _mousebuttonHandler = function(e) {
            e.preventDefault();
            
            this.buttonState(e.button, e.type === 'mousedown')
            .add(e)
            .core().focus();
        },

        _mouseCaptureHandler = function(e) {
            if (e.type == 'mouseout') {
                this.buttonState(false);
            }
        },

        _contextmenuHandler = function(e) {
            e.preventDefault();
        },

        _touchstartHandler = function(e) {
            e.preventDefault();
            
            this.buttonState(0, true)
            .add(e.touches[0])
            .core().focus();
        },

        _touchmoveHandler = function(e) {
            e.preventDefault();
            
            this.add(e.touches[0]);
        },

        _touchendHandler = function(e) {
            this.buttonState(false);
        },

        _blurHandler = function(e) {
            this.keyState(false)
            .core().blur();
        },

        _focusHandler = function(e) {
            this.core().focus();
        };
        
        return /** @lends GinListener.prototype */ {
            /** @constructs */
            init: function(core) {
                GinToolkit.assert(core, 'invalid core');
                
                var listener = new this();
                
                //// check browser info
                //if (GIN_REGEXP_IPHONE.test(userAgent)) {
                //    // iPhone, iPad or iPod touch
                //    listener = new GiniOSListener();
                //} else if (GIN_REGEXP_ANDROID.test(userAgent) && GIN_REGEXP_WEBKIT.test(userAgent)) {
                //    // Android webkit
                //    // Note: Android Firefox 4 doesn't have touch event yet
                //    listener = new GinAndroidListener();
                //} else {
                //    listener = new GinDesktopListener();
                //}

                listener._ = {
                    core: core,
                    history: GinEventHistory.create(),
                    keyState: {},
                    e: {
                        // ref: http://www.w3.org/TR/DOM-Level-3-Events/#events-mouseevents
                        // Note:
                        // no button attr, as more than 1 button may be pressed.
                        // no relatedTarget, as I don't want to leak DOM element info.
                        screenX: 0,
                        screenY: 0,
                        clientX: 0,
                        clientY: 0,
                        ctrlKey: false,
                        shiftKey: false,
                        altKey: false,
                        metaKey: false,
                        buttons: 0,
                        timeStamp: 0
                    }
                };
                
                return listener;
            },
        
            bind: function(element) {
                var self = this,
                    callbacks = {
                        blur: _blurHandler,
                        focus: _focusHandler,
                        keydown: _keyboardHandler,
                        keyup: _keyboardHandler,
                        mouseover: _mouseCaptureHandler,
                        mouseout: _mouseCaptureHandler,
                        mousedown: _mousebuttonHandler,
                        mouseup: _mousebuttonHandler,
                        contextmenu: _contextmenuHandler,
                        mousemove: _mousemoveHandler,
                        click: function() {
                            return false;
                        },
                        touchstart: _touchstartHandler,
                        touchmove: _touchmoveHandler,
                        touchend: _touchendHandler
                    },
                    i;
                
                for (i in callbacks) {
                    (function(name, callback) {
                        element.addEventListener(name, function(e) {
                            return callback.call(self, e);
                        }, false);
                    })(i, callbacks[i]);
                }
                
                return self;
            },
            set: function(params) {
                var e = this._.e,
                    i;
                
                for (i in params) {
                    GinToolkit.assert(params[i] !== undefined && e[i] !== undefined, 'param ' + i + ' is undefined');
                    e[i] = params[i];
                }
                
                e.timeStamp = Date.now();
                return this;
            },
            add: function(evt) {
                var history = this._.history,
                    current = history.current(),
                    e = this._.e;

                this.set({
                    screenX: evt.screenX,
                    screenY: evt.screenY,
                    clientX: evt.clientX,
                    clientY: evt.clientY
                });
                
                // ignore duplications
                if (current.screenX === e.screenX && current.screenY === e.screenY
                    && current.buttons === e.buttons) {
                    return this;
                }
                
                // TODO: refactory following hacky code
                this._.core._.stats.mousemoveCount++;
                
                history.add(e);

                return this;
            },
            keyState: function(key, state) {
                var data = this._;
                
                if (key === false) {
                    // clear key state
                    data.keyState = {};
                } else {
                    if (state) {
                        data.keyState[key] = true;
                    } else {
                        delete data.keyState[key];
                    }
                }
                
                return this;
            },
            buttonState: function(button, state) {
                var e = this._.e;
                
                if (button === false) {
                    // clear button state
                    e.buttons = 0;
                } else {
                    // according to DOM L3 Event, secondary/auxiliary button value definition is not the same in attr button and buttons
                    // refs http://www.w3.org/TR/DOM-Level-3-Events/#events-MouseEvent-buttons
                    button = button == 1? 2:
                        button == 2? 1: button;
                    
                    if (state) {
                        e.buttons |= 1 << button;
                    } else {
                        e.buttons &= ~(1 << button);
                    }
                }
                
                return this;
            },
            history: function() {
                return this._.history;
            },
            event: function() {
                var event = {},
                    e = this._.e,
                    i;
                
                for (i in e) {
                    event[i] = e[i];
                }
                
                event.history = this._.history;
                event.keyState = this._.keyState;
                
                return event;
            },
            core: function() {
                return this._.core;
            }
        };
    })()),

    GinLayer = Class(null, (function() {
        var _cloneEvent = function() {
            var e;
            
            if (this._.parent) {
                this._.offsetX = this._.parent._.offsetX + this._.parent.left();
                this._.offsetY = this._.parent._.offsetY + this._.parent.top();
            }
            
            e = this.core().event(this._.offsetX + this.left(),
                this._.offsetY + this.top());
            e.layer = this; // TODO: remove it
            
            // TODO: refactory this code
            e.history.offsetX = this._.offsetX;
            e.history.offsetY = this._.offsetY;
            e.history.left = this.left();
            e.history.top = this.top();
            
            return e;
        },

        //_fixOffset = function() {
        //    var element = this.element(),
        //        left = element.style.left || 0,
        //        top = element.style.top || 0;
        //    
        //    if (this.left() != Math.round(parseFloat(left, 10))) {
        //        this.left(left);
        //    }
        //    
        //    if (this.top() != Math.round(parseFloat(top, 10))) {
        //        this.top(top);
        //    }
        //},

        _addOrCallListener = function(name, listener, callMe, callChild, action) {
            if (listener instanceof Function) {
                this._.listeners[name] = listener;
                return this;
            }
            
            var e = undefined,
                i;
            
            if ((callChild || callMe) && action) {
                e = action.call(this)
            }
            
            if (callMe && this._.listeners[name] != GIN_FUNC_DUMMY) {
                this._.listeners[name].call(this, e);
            }
            
            if (callChild) {
                for (i in this._.layers) {
                    this._.layers[i][name].call(this._.layers[i], e);
                }
            }
            
            return this;
        },
        
        // call render callbacks
        _renderCaller = function(e) {
            // TODO: finish it
        },
        
        // call beforerender callbacks
        _beforerenderCaller = function(e) {
            // TODO: finish it
        };
        
        return /** @lends GinLayer.prototype */ {
            /** @constructs */
            init: function(settings, listeners) {
                var layer = new this(),
                    s = settings || {},
                    h = listeners || {},
                    element, canvas, style, data;

                if (s.parent !== null && !(s.parent instanceof GinLayer)) {
                    GinToolkit.error('parent must be GinLayer instance or null');
                    return;
                }
                
                if (!s.core) {
                    GinToolkit.error('core must be set');
                    return;
                }

                if (!s.name) {
                    GinToolkit.error('layer must have a string name');
                    return;
                }
                
                if (!s.parentElement) {
                    GinToolkit.error('parent element must be set');
                    return;
                }
                
                element = document.createElement('div');
                element.style.position = 'absolute';
                element.style.display = 'block';

                data = layer._ = {
                    name: s.name,
                    parent: s.parent,
                    core: s.core,
                    element: element,
                    parentElement: s.parentElement,
                    canvas: null,
                    context: null,
                    layers: {},
                    newStyle: {},
                    data: GinToolkit.getSetting(s.data, {}),
                    dataHooks: {},
                    offsetX: 0,
                    offsetY: 0,
                    detached: s.parent? false: true,
                    dialogMode: false,
                    attachment: GinToolkit.getSetting(s.attachment, null, function(value) {
                        if (!value || !value.nodeType) {
                            GinToolkit.error('attachment must be a DOM element');
                            return;
                        }
                        
                        return value;
                    }),
                    style: {
                        width: GinToolkit.getSetting(s.width, 0, GIN_REGEXP_NUMBER, function(value) {
                            if (value <= 0) {
                                return;
                            }
                            
                            element.style.width = value + 'px';
                            return value;
                        }),
                        height: GinToolkit.getSetting(s.height, 0, GIN_REGEXP_NUMBER, function(value) {
                            if (value <= 0) {
                                return;
                            }
                            
                            element.style.height = value + 'px';
                            return value;
                        }),
                        left: GinToolkit.getSetting(s.left, 0, GIN_REGEXP_NUMBER, function(value) {
                            element.style.left = value + 'px';
                            return value;
                        }),
                        top: GinToolkit.getSetting(s.top, 0, GIN_REGEXP_NUMBER, function(value) {
                            element.style.top = value + 'px';
                            return value;
                        })
                    },
                    listeners: {
                        beforerender: GinToolkit.parseListener(h, 'beforerender'),
                        render: GinToolkit.parseListener(h, 'render'),
                        destroy: GinToolkit.parseListener(h, 'destroy'),
                        size: GinToolkit.parseListener(h, 'size'),
                        play: GinToolkit.parseListener(h, 'play'),
                        stop: GinToolkit.parseListener(h, 'stop')
                    }
                };
                
                if (s.parent) {
                    // TODO: change it
                    data.offsetX = s.parent.offsetX + s.parent.left;
                    data.offsetY = s.parent.offsetY + s.parent.top;
                }
                
                canvas = document.createElement('canvas');
                style = canvas.style;
                style.position = 'absolute';
                style.left = 0;
                style.top = 0;
                style.width = data.style.width + 'px';
                style.height = data.style.height + 'px';
                canvas.width = data.style.width;
                canvas.height = data.style.height;
                element.appendChild(canvas);
                data.canvas = canvas;
                data.context = layer.getContext(data.canvas);
                data.parentElement.appendChild(element);
                
                if (data.attachment && data.attachment.nodeType) {
                    element.appendChild(data.attachment);
                }
                
                if (GinToolkit.getSetting(s.hidden, false, function(value) {
                    return value === true? value: undefined;
                })) {
                    layer.hide();
                }
                
                // register gin* event listener on core
                data.core.register(h);
                
                GinToolkit.parseListener(h, 'start').call(layer);
                
                if (GinToolkit.getSetting(s.autoPlay, true, function(value) {
                    return value === false? value: undefined;
                })) {
                    layer.play();
                }
                
                if (GinToolkit.getSetting(s.dialogMode, false, function(value) {
                    return value === true? value: undefined;
                })) {
                    layer.dialog(true);
                }
                
                return layer;
            },
        
            layer: function(name, settings, listeners) {
                var s = settings || {},
                    names = name,
                    topLevelName, layer;

                if (settings === undefined) {
                    if (typeof name !== 'string' && !(name instanceof Array)) {
                        GinToolkit.error('name must be string or array');
                        return;
                    }

                    if (this._.layers[name]) {
                        return this._.layers[name];
                    }
                    
                    if (typeof name === 'string') {
                        names = name.split(GIN_REGEXP_BLANK);
                    }
                    
                    if (!names.shift) {
                        GinToolkit.error('names must be array or string');
                        return;
                    }
                    
                    topLevelName = names.shift();
                    
                    if (!this._.layers[topLevelName]) {
                        GinToolkit.error('layer does not exist. [name: ' + topLevelName + ']');
                        return;
                    }
                    
                    if (names.length) {
                        return this._.layers[topLevelName].layers(names);
                    } else {
                        return this._.layers[topLevelName];
                    }
                }
                
                if (this._.layers[name]) {
                    GinToolkit.debug('layer already exists. [name: ' + name + ']');
                    return this;
                }
                
                if (!GIN_REGEXP_NAME.test(name)) {
                    GinToolkit.error('invalid layer name. [name: ' + name + ']');
                    return;
                }
                
                s.parent = this;
                s.parentElement = this._.element;
                s.core = this.core();
                s.name = name;
                layer = GinLayer.create(s, listeners);
                
                if (!layer) {
                    GinToolkit.error('cannot create new layer');
                    return;
                }
                
                this._.layers[name] = layer;
                return this;
            },
            remove: function(name) {
                if (!this._.layers[name]) {
                    GinToolkit.error('layer does not exist. [name: ' + name + ']');
                    return this;
                }
                
                var layer = this._.layers[name]
                delete this._.layers[name];
                this._.element.removeChild(layer._.element);
                
                return this;
            },
            detach: function() {
                if (!this._.parent) {
                    GinToolkit.error('top layer cannot be detached');
                    return this;
                }
                
                this._.parent.remove(this._.name);
                this._.detached = true;
                this._.parent = null;
                return this;
            },
            attach: function(layer) {
                if (!(layer instanceof GinLayer)) {
                    GinToolkit.error('only GinLayer instance can be attached');
                    return this;
                }
                
                if (!layer._.detached) {
                    GinToolkit.error('layer is not detached');
                    return this;
                }
                
                if (this._.layers[layer._.name]) {
                    GinToolkit.error('layer name conflicts. [name: ' + layer._.name + ']');
                    return this;
                }
                
                this._.layers[layer._.name] = layer;
                this._.element.appendChild(layer._.element);
                layer._.parent = this;
                layer._.detached = false;
                return this;
            },
            attachTo: function(layer) {
                if (!(layer instanceof GinLayer)) {
                    GinToolkit.error('only GinLayer instance can be attached to');
                    return this;
                }
                
                if (!this._.detached) {
                    this.detach();
                }
                
                return layer.attach(this);
            },
            name: function() {
                return this._.name;
            },
            parent: function() {
                return this._.parent;
            },
            core: function() {
                return this._.core;
            },
            element: function() {
                return this._.element;
            },
            style: function(property, value) {
                var style = this._.newStyle;
                
                // white list mode. only support following styles.
                switch (property) {
                case 'width':
                case 'height':
                case 'top':
                case 'left':
                    if (this._.style[property] != value) {
                        style[property] = value + 'px';
                    }
                }

                return this;
            },
            left: function(val) {
                if (val === undefined) {
                    return this._.style.left;
                }
                
                if (GIN_REGEXP_NUMBER.test(val)) {
                    this.style('left', val);
                }
                
                return this;
            },
            top: function(val) {
                if (val === undefined) {
                    return this._.style.top;
                }
                
                if (GIN_REGEXP_NUMBER.test(val)) {
                    this.style('top', val);
                }
                
                return this;
            },
            width: function(val) {
                if (val === undefined) {
                    return this._.style.width;
                }
                
                if (!this._.parent && !GinToolkit.verifyFriendMethod(arguments)) {
                    GinToolkit.error('unauthorized call to this function');
                    return this;
                }
                
                if (GIN_REGEXP_NUMBER.test(val) && val >= 0) {
                    this.style('width', val);
                }
                
                return this;
            },
            height: function(val) {
                if (val === undefined) {
                    return this._.style.height;
                }
                
                if (!this._.parent && !GinToolkit.verifyFriendMethod(arguments)) {
                    GinToolkit.error('unauthorized call to this function');
                    return this;
                }
                
                if (GIN_REGEXP_NUMBER.test(val) && val >= 0) {
                    this.style('height', val);
                }
                
                return this;
            },
            draw: function(callback) {
                if (!(callback instanceof Function)) {
                    GinToolkit.error('callback must be a function');
                    return this;
                }
                
                var e = _cloneEvent.call(this),
                    data = this._;
                
                e.context = data.context;
                e.context.save();
                callback.call(this, e);
                e.context.restore();
                
                return this;
            },
            updateStyle: function() {
                var style = this._.newStyle,
                    element = this._.element,
                    canvas = this._.canvas,
                    i;

                for (i in this._.layers) {
                    this._.layers[i].updateStyle();
                }
                
                if (GinToolkit.emptyObject(style)) {
                    return this;
                }
                
                for (i in style) {
                    element.style[i] = style[i];
                    this._.style[i] = Math.round(parseFloat(style[i]));
                }
                
                for (i in style) {
                    switch (i) {
                    case 'width':
                    case 'height':
                        canvas.style[i] = style[i];
                        canvas[i] = Math.round(parseFloat(style[i]));
                        break;
                    }
                }
                
                this._.newStyle = {};
                return this;
            },
            data: function(key, value, hook) {
                if (key === undefined) {
                    GinToolkit.error('data key cannot be undefined');
                    return;
                }
                
                if (value === undefined) {
                    return this._.data[key];
                }
                
                if (hook instanceof Function) {
                    this._.dataHooks[key] = hook;
                }
                
                if (this._.dataHooks[key]) {
                    this._.dataHooks[key].call(this, value, this._.data[key]);
                }
                
                this._.data[key] = value;
                return this;
            },
            beforerender: function(listener) {
                return _addOrCallListener.call(this,
                    'beforerender', listener, this._.playing, this._.playing, function() {
                        return _cloneEvent.call(this);
                    });
            },
            render: function(listener) {
                return _addOrCallListener.call(this,
                    'render', listener, false, this._.playing, function() {
                        this.draw(this._.listeners.render);
                    });
            },
            destroy: function(listener) {
                return _addOrCallListener.call(this,
                    'destroy', listener, true, true, function() {
                        var parent = this._.parent;
                        
                        if (parent) {
                            parent.remove(this.name());
                        }
                    });
            },
            play: function(listener) {
                return _addOrCallListener.call(this,
                    'play', listener, !this._.playing, false, function() {
                        this._.playing = true;
                    });
            },
            stop: function(listener) {
                return _addOrCallListener.call(this,
                    'stop', listener, this._.playing, false, function() {
                        this._.playing = false;
                    });
            },
            size: function(listener) {
                return _addOrCallListener.call(this,
                    'size', listener, true, true, function() {
                        return {
                            width: this.core().width(),
                            height: this.core().height()
                        };
                    });
            },
            show: function() {
                this._.element.style.display = 'block';
                return this;
            },
            hide: function() {
                this._.element.style.display = 'none';
                return this;
            },
            dialog: function(mode) {
                if (mode && !this._.dialogMode) {
                    this._.dialogMode = true;
                    this._.element.style.zIndex = GIN_ZINDEX_DIALOG_LAYER;
                } else if (!mode && this._.dialogMode) {
                    this._.dialogMode = false;
                    this._.element.style.zIndex = '';
                }
                
                return this;
            },
            getContext: function(canvas) {
                return canvas.getContext('2d');
            }
        };
    })()),
    
    GinEventHistory = Class(null, (function() {
        return /** @lends GinEventHistory.prototype */ {
            /** @constructs */
            init: function() {
                var history = new this();
                
                history._ = {
                    history: {
                        current: 0,
                        last: 0,
                        cursorLast: 0
                    },
                    log: {}
                };
                
                return history;
            },
        
            add: function(e) {
                var history = this._.history,
                    log = this._.log;

                history.current = (history.current + 1) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY;
                
                if (history.current == history.last) {
                    history.last++;
                }
                
                log[history.current] = {
                    screenX: e.screenX,
                    screenY: e.screenY,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    buttons: e.buttons,
                    timeStamp: e.timeStamp
                };
                
                return this;
            },
            current: function() {
                var history = this._.history;
                
                if (history.last == history.current) {
                    return {};
                } else {
                    return this._.log[this._.history.current];
                }
            },
            each: function(callback, self) {
                if (!(callback instanceof Function)) {
                    GinToolkit.error('callback must be a function');
                    return this;
                }
                
                var data = this._,
                    history = data.history,
                    log = data.log,
                    last = history.last,
                    len = (history.current - last + GIN_EVENT_MOUSEMOVE_MAX_HISTORY) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY,
                    // TODO: refactory following code
                    offsetX = this.offsetX,
                    offsetY = this.offsetY,
                    left = this.left,
                    top = this.top,
                    i, prev = false, next;
                
                for (i = 1; i <= len; i++) {
                    next = log[(i + last) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY];
                    next.clientX -= offsetX + left;
                    next.clientY -= offsetY + top;
                    callback.call(self, next, prev);
                    
                    prev.clientX += offsetX + left;
                    prev.clientY += offsetY + top;
                    prev = next;
                }
                
                history.cursorLast = history.current;
                return this;
            },
            clear: function(onlyClearViewed) {
                var history = this._.history;
                
                if (onlyClearViewed) {
                    history.last = history.cursorLast;
                } else {
                    history.last = history.cursorLast = history.current;
                }
                
                return true;
            }
        };
    })()),
    
    // define the Gin and GinLayers
    Gin = window.$G = window.Gin = function(id, settings, listeners) {
        return GinCore.create(id, settings, listeners);
    };

    Gin.extend = function() {
        return GinLayer.extend.apply(GinLayer, arguments);
    };
})(window);
