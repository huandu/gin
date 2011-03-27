/*!
 * gin HTML5 Game Engine v1.1.0 dev
 * https://github.com/huandu/gin/
 *
 * Copyright 2011, Huan Du
 * Licensed under the MIT license
 * https://github.com/huandu/gin/blob/master/LICENSE
 */

/*#{{
replace /_debug\(/ //_debug(
replace /_error\(/ //_error(
replace /_assert\(/ //_error(
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
    
    GIN_REGEXP_ANDROID = /Android/,
    GIN_REGEXP_WEBKIT = /AppleWebKit/,
    GIN_REGEXP_IPHONE = /(iPhone)|(iOS)/,

    GIN_EVENT_MOUSEMOVE_MAX_HISTORY = 300,

    GIN_FUNC_DUMMY = function() {},

    GIN_ZINDEX_EVENT_LAYER = 10000,
    GIN_ZINDEX_DIALOG_LAYER = GIN_ZINDEX_EVENT_LAYER + 1,

    document = window.document,

    // define the Gin and GinLayers
    Gin = (function() {
        var GinCore = function() {},
            GinListener = function() {},
            GinDesktopListener, GiniOSListener, GinAndroidListener,
            GinLayer = function() {},
            GinEventHistory = function() {},
            Gin = function(id, settings, listeners) {
                return GinCore.create(id, settings, listeners);
            },
            
            _extendClass = function(baseClass, extra, clone) {
                if (!(baseClass instanceof Function) || typeof extra != 'object') {
                    _error('baseClass must be a function and new prototype object must be an object');
                    return;
                }
                
                var target = baseClass,
                    i;
                
                if (clone) {
                    target = _extendClass(function() {}, baseClass.prototype);
                }
                
                for (i in extra) {
                    target.prototype[i] = extra[i];
                }
                
                return target;
            };
        
        GinCore.create = function(id, settings, listeners) {
            if (!id) {
                _error('id cannot be empty');
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
                    _error('cannot find element by id. [id: ' + id + ']');
                    return;
                }
            } else {
                _error('invalid id. [id: ' + id.toString() + ']');
                return;
            }
            
            // initialize gin attributes.
            data = gin._ = {
                element: element,
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
                fps: _getSetting(s.fps, GIN_FPS_DEFAULT, GIN_REGEXP_NUMBER, function(value) {
                    if (value < GIN_FPS_MIN || value > GIN_FPS_MAX) {
                        _error('fps setting must in range of [' + GIN_FPS_MIN + ', ' + GIN_FPS_MAX + ']. '
                            + '[fps: ' + value + ']');
                        return;
                    }
                    
                    return value;
                }),
                width: _getSetting(s.width, element.clientWidth, GIN_REGEXP_NUMBER, function(value) {
                    if (value <= 0) {
                        return;
                    }
                    
                    element.style.width = value + 'px';
                    element.width = value;
                    return value;
                }),
                height: _getSetting(s.height, element.clientHeight, GIN_REGEXP_NUMBER, function(value) {
                    if (value <= 0) {
                        return;
                    }
                    
                    element.style.height = value + 'px';
                    element.height = value;
                    return value;
                }),
                autoPause: _getSetting(s.autoPause, false, function(value) {
                    return value === true? value: undefined;
                }),
                listeners: {
                    start: _parseListener(h, 'start'),
                    pause: _parseListener(h, 'pause'),
                    stop: _parseListener(h, 'stop'),
                    restart: _parseListener(h, 'restart'),
                    blur: _parseListener(h, 'blur'),
                    focus: _parseListener(h, 'focus')
                }
            };
            
            data.interval = 1000. / data.fps;
            
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
                start: _parseListener(h, 'start'),
                play: _parseListener(h, 'play'),
                stop: _parseListener(h, 'stop'),
                beforerender: _parseListener(h, 'beforerender'),
                render: _parseListener(h, 'render'),
                size: _parseListener(h, 'size'),
                destroy: function() {
                    gin.stop();
                }
            });
            
            if (!layer) {
                _error('cannot create default layer instance');
                return;
            }
            
            // only this.resize is able to change root layer's width/height.
            // TODO: refactory this
            _setFriendMethod(gin.resize, layer.width);
            _setFriendMethod(gin.resize, layer.height);
            data.layer = layer;
            
            // receiver is the div receive all keyboard/mouse events
            receiver = document.createElement('div');
            data.receiver = receiver;
            receiver._ = {core: gin};
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
            
            if (_getSetting(s.autoStart, true, function(value) {
                return value === false? value: undefined;
            })) {
                gin.start();
            }
            
            return gin;
        };
        
        GinCore.prototype = {
            start: function() {
                var data = this._;
                
                if (data.state == GIN_STATE_STARTED) {
                    return this;
                }
                
                if (data.state != GIN_STATE_INIT && data.state != GIN_STATE_STOPPED
                    && data.state != GIN_STATE_PAUSED) {
                    _error('only GIN_STATE_INIT, GIN_STATE_STOPPED and GIN_STATE_PAUSED can be started.'
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
                data.layer.play();
                _debug('gin is started');
                
                return this;
            },
            pause: function() {
                var data = this._;
                
                if (data.state == GIN_STATE_PAUSED) {
                    return this;
                }
                
                if (data.state != GIN_STATE_STARTED) {
                    _error('only GIN_STATE_STARTED can be started. [state: ' + data.state + ']');
                    return this;
                }
                
                data.state = GIN_STATE_PAUSED;
                data.layer.stop();
                _debug('gin is paused');
                
                return this;
            },
            stop: function() {
                var data = this._;
                
                if (data.state == GIN_STATE_STOPPED) {
                    return this;
                }
                
                if (data.state != GIN_STATE_STARTED && data.state != GIN_STATE_PAUSED) {
                    _error('only GIN_STATE_STARTED and GIN_STATE_PAUSED can be stopped.'
                        + ' [state: ' + data.state + ']');
                    return this;
                }
                
                if (data.timer) {
                    window.clearInterval(data.timer);
                    data.timer = 0;
                }
                
                data.state = GIN_STATE_STOPPED;
                data.layer.stop();
                _debug('gin is stopped');
                
                return this;
            },
            restart: function() {
                if (this._.state != GIN_STATE_STARTED && this._.state != GIN_STATE_PAUSED) {
                    _error('only GIN_STATE_STARTED and GIN_STATE_PAUSED can be restarted.'
                        + ' [state: ' + this._.state + ']');
                    return this;
                }
                
                this.stop();
                this.start();
                return this;
            },
            blur: function(listener) {
                if (listener instanceof Function) {
                    this._.listeners.blur = listener;
                    return this;
                }
                
                if (this._.hasFocus) {
                    this._.hasFocus = false;
                    this._.listeners.blur.call(this);
                    
                    if (this._.autoPause) {
                        this.pause();
                    }
                }
            },
            focus: function(listener) {
                if (listener instanceof Function) {
                    this._.listeners.focus = listener;
                    return this;
                }
                
                if (!this._.hasFocus) {
                    this._.hasFocus = true;
                    this._.listeners.focus.call(this);
                    
                    if (this._.autoPause) {
                        this.start();
                    }
                }
            },
            resize: function(width, height) {
                var w = width || this._.element.clientWidth,
                    h = height || this._.element.clientHeight,
                    element = this._.element,
                    receiver = this._.receiver,
                    layer = this._.layer,
                    needResize = false;
                
                if (isNaN(w) || w < 0 || isNaN(h) || h < 0) {
                    _error('invalid width or height');
                    return this;
                }
                
                if (w != this._.width) {
                    needResize = true;
                    this._.width = w;
                    receiver.style.width = w + 'px';
                    layer.width(w);
                    
                    if (w != this._.element.clientWidth) {
                        element.style.width = w + 'px';
                        element.width = w;
                    }
                }
                
                if (h != this._.height) {
                    needResize = true;
                    this._.height = h;
                    receiver.style.height = h + 'px';
                    layer.height(h);
                    
                    if (h != this._.element.clientHeight) {
                        element.style.height = h + 'px';
                        element.height = h;
                    }
                }
                
                if (needResize) {
                    // TODO: change it to this.size()
                    layer.size();
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
            // extend GinLayer prototype
            extend: function(ext) {
                _extendClass(GinLayer, ext);
                return this;
            }
        };

        GinLayer.create = function(settings, listeners) {
            var layer = new this(),
                s = settings || {},
                h = listeners || {},
                element, canvas, style, data;

            if (s.parent !== null && !(s.parent instanceof GinLayer)) {
                _error('parent must be GinLayer instance or null');
                return;
            }
            
            if (!s.core) {
                _error('core must be set');
                return;
            }

            if (!s.name) {
                _error('layer must have a string name');
                return;
            }
            
            if (!s.parentElement) {
                _error('parent element must be set');
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
                data: _getSetting(s.data, {}),
                dataHooks: {},
                offsetX: 0,
                offsetY: 0,
                detached: s.parent? false: true,
                dialogMode: false,
                attachment: _getSetting(s.attachment, null, function(value) {
                    if (!value || !value.nodeType) {
                        _error('attachment must be a DOM element');
                        return;
                    }
                    
                    return value;
                }),
                style: {
                    width: _getSetting(s.width, 0, GIN_REGEXP_NUMBER, function(value) {
                        if (value <= 0) {
                            return;
                        }
                        
                        element.style.width = value + 'px';
                        return value;
                    }),
                    height: _getSetting(s.height, 0, GIN_REGEXP_NUMBER, function(value) {
                        if (value <= 0) {
                            return;
                        }
                        
                        element.style.height = value + 'px';
                        return value;
                    }),
                    left: _getSetting(s.left, 0, GIN_REGEXP_NUMBER, function(value) {
                        element.style.left = value + 'px';
                        return value;
                    }),
                    top: _getSetting(s.top, 0, GIN_REGEXP_NUMBER, function(value) {
                        element.style.top = value + 'px';
                        return value;
                    })
                },
                listeners: {
                    beforerender: _parseListener(h, 'beforerender'),
                    render: _parseListener(h, 'render'),
                    destroy: _parseListener(h, 'destroy'),
                    size: _parseListener(h, 'size'),
                    play: _parseListener(h, 'play'),
                    stop: _parseListener(h, 'stop')
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
            
            if (_getSetting(s.hidden, false, function(value) {
                return value === true? value: undefined;
            })) {
                layer.hide();
            }
            
            // TODO: register event listener on core
            
            _parseListener(h, 'start').call(layer);
            
            if (_getSetting(s.autoPlay, true, function(value) {
                return value === false? value: undefined;
            })) {
                layer.play();
            }
            
            if (_getSetting(s.dialogMode, false, function(value) {
                return value === true? value: undefined;
            })) {
                layer.dialog(true);
            }
            
            return layer;
        };

        GinLayer.prototype = {
            layer: function(name, settings, listeners) {
                var s = settings || {},
                    names = name,
                    topLevelName, layer;

                if (settings === undefined) {
                    if (typeof name !== 'string' && !(name instanceof Array)) {
                        _error('name must be string or array');
                        return;
                    }

                    if (this._.layers[name]) {
                        return this._.layers[name];
                    }
                    
                    if (typeof name === 'string') {
                        names = name.split(GIN_REGEXP_BLANK);
                    }
                    
                    if (!names.shift) {
                        _error('names must be array or string');
                        return;
                    }
                    
                    topLevelName = names.shift();
                    
                    if (!this._.layers[topLevelName]) {
                        _error('layer does not exist. [name: ' + topLevelName + ']');
                        return;
                    }
                    
                    if (names.length) {
                        return this._.layers[topLevelName].layers(names);
                    } else {
                        return this._.layers[topLevelName];
                    }
                }
                
                if (this._.layers[name]) {
                    _debug('layer already exists. [name: ' + name + ']');
                    return this;
                }
                
                if (!GIN_REGEXP_NAME.test(name)) {
                    _error('invalid layer name. [name: ' + name + ']');
                    return;
                }
                
                s.parent = this;
                s.parentElement = this._.element;
                s.core = this.core();
                s.name = name;
                layer = GinLayer.create(s, listeners);
                
                if (!layer) {
                    _error('cannot create new layer');
                    return;
                }
                
                this._.layers[name] = layer;
                return this;
            },
            remove: function(name) {
                if (!this._.layers[name]) {
                    _error('layer does not exist. [name: ' + name + ']');
                    return this;
                }
                
                var layer = this._.layers[name]
                delete this._.layers[name];
                this._.element.removeChild(layer._.element);
                
                return this;
            },
            detach: function() {
                if (!this._.parent) {
                    _error('top layer cannot be detached');
                    return this;
                }
                
                this._.parent.remove(this._.name);
                this._.detached = true;
                this._.parent = null;
                return this;
            },
            attach: function(layer) {
                if (!(layer instanceof GinLayer)) {
                    _error('only GinLayer instance can be attached');
                    return this;
                }
                
                if (!layer._.detached) {
                    _error('layer is not detached');
                    return this;
                }
                
                if (this._.layers[layer._.name]) {
                    _error('layer name conflicts. [name: ' + layer._.name + ']');
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
                    _error('only GinLayer instance can be attached to');
                    return this;
                }
                
                if (!this._.detached) {
                    this.detach();
                }
                
                return layer.attach(this);
            }
        };
        
        GinEventHistory.create = function() {
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
        };
        
        GinEventHistory.prototype = {
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
                    _error('callback must be a function');
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

        GinListener.create = function(core) {
            _assert(core, 'invalid core');
            
            var userAgent = window.navigator.userAgent,
                listener = null,
                callbacks, i, data;
            
            // check browser info
            if (GIN_REGEXP_IPHONE.test(userAgent)) {
                // iPhone, iPad or iPod touch
                listener = new GiniOSListener();
            } else if (GIN_REGEXP_ANDROID.test(userAgent) && GIN_REGEXP_WEBKIT.test(userAgent)) {
                // Android webkit
                // Note: Android Firefox 4 doesn't have touch event yet
                listener = new GinAndroidListener();
            } else {
                listener = new GinDesktopListener();
            }
            
            data = listener._ = {
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
        };
        
        GinListener.prototype = {
            bind: function(element) {
                var self = this,
                    callbacks = self.callbacks(),
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
                    _assert(params[i] !== undefined && e[i] !== undefined, 'param ' + i + ' is undefined');
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
        
        GinDesktopListener = _extendClass(GinListener, {
            callbacks: function() {
                return {
                    blur: _blurHandler,
                    focus: _focusHandler,
                    keydown: _keyboardHandler,
                    keyup: _keyboardHandler,
                    mouseover: _mouseCaptureHandler,
                    mouseout: _mouseCaptureHandler,
                    mousedown: _mousebuttonHandler,
                    mouseup: _mousebuttonHandler,
                    contextmenu: _contextmenuHandler,
                    mousemove: _mousemoveHandler
                };
            }
        }, true);

        GiniOSListener = _extendClass(GinListener, {
            callbacks: function() {
                return {
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
                };
            }
        }, true);

        GinAndroidListener = _extendClass(GinListener, {
            callbacks: function() {
                return {
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
                };
            }
        }, true);

        Gin.extend = GinCore.prototype.extend;
        return window.$G = window.Gin = Gin;
    })(),

    _GinLayer_cloneEvent = function() {
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

    //_GinLayer_fixOffset = function() {
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

    _GinLayer_addOrCallListener = function(name, listener, callMe, callChild, action) {
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
    _GinLayer_renderCaller = function(e) {
        // TODO: finish it
    },
    
    // call beforerender callbacks
    _GinLayer_beforerenderCaller = function(e) {
        // TODO: finish it
    },
    
    _GinEvent_history_each = function(callback) {
        // TODO: correct this refs
        if (!(callback instanceof Function)) {
            return this;
        }
        
        var history = this._data,
            current = history.current,
            last = history.traverseLast,
            i = last,
            cur = null,
            prev = history[i],
            ret;
        
        // history is empty.
        if (current == last) {
            return this;
        }
        
        do {
            i = (i + 1) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY;
            cur = {
                clientX: history[i].clientX - this.offsetX,
                clientY: history[i].clientY - this.offsetY,
                mouseState: history[i].mouseState,
                button: history[i].button,
                timeStamp: history[i].timeStamp
            };
            
            ret = callback.call(this.layer, cur, prev);
            prev = cur;
        } while (i != current && ret !== false);
        
        // record the last traversed history position
        if ((current + GIN_EVENT_MOUSEMOVE_MAX_HISTORY - i) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY
            < (current + GIN_EVENT_MOUSEMOVE_MAX_HISTORY - history.last) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY) {
            history.last = i;
        }
        
        return this;
    },
    
    _GinEvent_history_clear = function() {
        // TODO: correct this refs
        if (!this.mousemoveHistory) {
            return this;
        }
        
        var history = this.mousemoveHistory;
        history.last = history.current;
        
        return this;
    },
    
    _extendClass = function(baseClass, extra, clone) {
        if (!(baseClass instanceof Function) || typeof extra != 'object') {
            _error('baseClass must be a function and new prototype object must be an object');
            return;
        }
        
        var target = baseClass,
            i;
        
        if (clone) {
            target = _extendClass(function() {}, baseClass.prototype);
        }
        
        for (i in extra) {
            target.prototype[i] = extra[i];
        }
        
        return target;
    },

    _deepClone = function(obj) {
        var copy = {},
            target, i;
        
        for (i in obj) {
            target = obj[i];
            
            if (typeof target === 'object') {
                copy[i] = _deepClone(target);
            } else {
                copy[i] = target;
            }
        }
        
        return copy;
    },
    
    // get browser name and platform name
    _getBrowserId = function() {
    },
    
    _logger = function(logger, args) {
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
    },

    _debug = function() {
        _logger('info', arguments);
    },

    _error = function() {
        _logger('error', arguments);
    },
    
    _assert = function(expr, text) {
        if (!expr) {
            _logger('error', 'assertion failed!', text);
            throw new Error('assertion failed! '+ text);
        }
    },

    _getSetting = function(value, defValue, regexp, action) {
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

    _parseListener = function(listeners, item) {
        if (listeners[item] instanceof Function) {
            return listeners[item];
        }
        
        return GIN_FUNC_DUMMY;
    },

    _keyboardHandler = function(e) {
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
    },

    _setFriendMethod = function(caller, callee) {
        caller._friends = caller._friends || [];
        caller._friends.push(callee.toString());
        return caller;
    },

    _verifyFriendMethod = function(args) {
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

    _emptyObject = function(obj) {
        for (var i in obj) {
            return false;
        }
        
        return true;
    };

    Gin.extend({
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
            
            if (!this._.parent && !_verifyFriendMethod(arguments)) {
                _error('unauthorized call to this function');
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
            
            if (!this._.parent && !_verifyFriendMethod(arguments)) {
                _error('unauthorized call to this function');
                return this;
            }
            
            if (GIN_REGEXP_NUMBER.test(val) && val >= 0) {
                this.style('height', val);
            }
            
            return this;
        },
        draw: function(callback) {
            if (!(callback instanceof Function)) {
                _error('callback must be a function');
                return this;
            }
            
            var e = _GinLayer_cloneEvent.call(this),
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
            
            if (_emptyObject(style)) {
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
                _error('data key cannot be undefined');
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
            return _GinLayer_addOrCallListener.call(this,
                'beforerender', listener, this._.playing, this._.playing, function() {
                    return _GinLayer_cloneEvent.call(this);
                });
        },
        render: function(listener) {
            return _GinLayer_addOrCallListener.call(this,
                'render', listener, false, this._.playing, function() {
                    this.draw(this._.listeners.render);
                });
        },
        destroy: function(listener) {
            return _GinLayer_addOrCallListener.call(this,
                'destroy', listener, true, true, function() {
                    var parent = this._.parent;
                    
                    if (parent) {
                        parent.remove(this.name());
                    }
                });
        },
        play: function(listener) {
            return _GinLayer_addOrCallListener.call(this,
                'play', listener, !this._.playing, false, function() {
                    this._.playing = true;
                });
        },
        stop: function(listener) {
            return _GinLayer_addOrCallListener.call(this,
                'stop', listener, this._.playing, false, function() {
                    this._.playing = false;
                });
        },
        size: function(listener) {
            return _GinLayer_addOrCallListener.call(this,
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
    });
})(window);
