/*!
 TODO: put licence info here
 */

/*#{{
replace /_debug\(/ //_debug(
replace /_error\(/ //_error(
}}#*/

(function(window, undefined){
const GIN_FPS_DEFAULT = 25;
const GIN_FPS_MIN = 1;
const GIN_FPS_MAX = 100;

const GIN_STATE_INIT = 1;
const GIN_STATE_STARTED = 2;
const GIN_STATE_PAUSED = 3;
const GIN_STATE_STOPPED = 4;

const GIN_INTERVAL_TOLERANCE = 5;

const GIN_REGEXP_NAME = /^[a-zA-Z_\-][a-zA-Z_0-9\-]*$/;
const GIN_REGEXP_BLANK = /\s+/;
const GIN_REGEXP_INT = /^\d+$/;
const GIN_REGEXP_ANY = /.*/;

const GIN_EVENT_MOUSEMOVE_MAX_HISTORY = 300;

const GIN_FUNC_DUMMY = function() {};

const GIN_VK_SHIFT = 16;
const GIN_VK_CTRL = 17;
const GIN_VK_ALT = 18;
const GIN_VK_CAPSLOCK = 20;

var document = window.document;

var Gin = (function(){
	var Gin = function(id, settings, hooks) {
		return new Gin.prototype.init(id, settings, hooks);
	};
	
	Gin.prototype = {
		init: function(id, settings, hooks) {
			if (!id) {
				_error('id cannot be empty');
				return;
			}
			
			var s = settings || {};
			var h = hooks || {};
			var element;
			
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
			var now = Date.now();
			this._ = {
				element: element,
				state: GIN_STATE_INIT,
				framePrepared: false,
				frameRenderedPerSecond: 0,
				frameRenderingTimeInSecond: 0,
				e: {
					keyStates: [],
					buttonStates: [],
					startTime: now,
					lastTime: now,
					stats: {
						frameCount: 0,
						mousemoveCount: 0
					},
					clientX: 0,
					clientY: 0,
					mouseover: false,
					hasFocus: true,
				},
				mousemoveHistory: {
					current: 0,
					last: 0,
					length: 0
				},
				fps: _getSetting(s.fps, GIN_FPS_DEFAULT, GIN_REGEXP_INT, function(value) {
					if (value < GIN_FPS_MIN || value > GIN_FPS_MAX) {
						_error('fps setting must in range of [' + GIN_FPS_MIN + ', ' + GIN_FPS_MAX + ']. '
							+ '[fps: ' + value + ']');
						return;
					}
					
					return value;
				}),
				width: _getSetting(s.width, element.clientWidth, GIN_REGEXP_INT, function(value) {
					if (value <= 0) {
						return;
					}
					
					element.style.width = value + 'px';
					element.width = value;
					return value;
				}),
				height: _getSetting(s.height, element.clientHeight, GIN_REGEXP_INT, function(value) {
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
				hooks: {
					start: _parseHook(h, 'start'),
					pause: _parseHook(h, 'pause'),
					stop: _parseHook(h, 'stop'),
					restart: _parseHook(h, 'restart'),
					blur: _parseHook(h, 'blur'),
					focus: _parseHook(h, 'focus')
				}
			};
			
			this._.interval = 1000. / this._.fps;
			
			// create root layer. it's the parent of any other layers.
			var layer = GinLayer.prototype.create({
				width: this._.width,
				height: this._.height,
				left: 0,
				top: 0,
				core: this,
				name: 'root',
				parent: null,
				parentElement: element
			}, {
				beforerender: h.beforerender,
				render: h.render,
				destroy: function() {
					this.core().stop();
				}
			});
			
			if (!layer) {
				_error('cannot create default layer instance');
				return;
			}
			
			// only this.resize is able to change root layer's width/height.
			_setFriendMethod(this.resize, layer.width);
			_setFriendMethod(this.resize, layer.height);
			this._.layer = layer;
			
			// receiver is the div receive all keyboard/mouse events
			var receiver = document.createElement('div');
			this._.receiver = receiver;
			receiver._ = {core: this};
			receiver.style.position = 'absolute';
			receiver.style.left = 0;
			receiver.style.top = 0;
			receiver.style.width = this._.width + 'px';
			receiver.style.height = this._.height + 'px';
			receiver.style.zIndex = 10000;
			receiver.style.outline = 0;
			receiver.tabIndex = 1;
			element.appendChild(receiver);
			
			receiver.focus();
			receiver.addEventListener('blur', _blurHandler, false);
			receiver.addEventListener('focus', _focusHandler, false);
			receiver.addEventListener('keydown', _keyboardHandler, false);
			receiver.addEventListener('keyup', _keyboardHandler, false);
			receiver.addEventListener('mouseover', _mouseCaptureHandler, false);
			receiver.addEventListener('mouseout', _mouseCaptureHandler, false);
			receiver.addEventListener('mousedown', _mousebuttonHandler, false);
			receiver.addEventListener('mouseup', _mousebuttonHandler, false);
			receiver.addEventListener('contextmenu', _contextmenuHandler, false);
			receiver.addEventListener('mousemove', _mousemoveHandler, false);
			
			var self = this;
			window.setInterval(function() {self.resize();}, 100);
			
			if (_getSetting(s.autoStart, true, function(value) {
				return value === false? value: undefined;
			})) {
				this.start();
			}
			
			return this;
		},
		layer: function() {
			return this._.layer;
		},
		start: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.start = hook;
				return this;
			}
			
			if (this._.state == GIN_STATE_STARTED) {
				return this;
			}
			
			if (this._.state != GIN_STATE_INIT && this._.state != GIN_STATE_STOPPED
				&& this._.state != GIN_STATE_PAUSED) {
				_error('only GIN_STATE_INIT, GIN_STATE_STOPPED and GIN_STATE_PAUSED can be started.'
					+ ' [state: ' + this._.state + ']');
				return this;
			}
			
			this._.hooks.start.call(this.layer());
			var layer = this.layer();
			this._.frameRenderingTimeInSecond = Date.now() % 1000;
			var self = this;
			
			this._.timer = window.setInterval(function() {
				var now = Date.now();
				var fps = self._.fps;
				var e = self._.e;
				var stats = self._.e.stats;
				var frameCount = stats.frameCount;
				var layer = self.layer();
				
				_updateEventStats(e, now);
				
				// frame rendered in 1s must be always lower than fps in setting.
				if (frameCount >= fps && self._.framePrepared) {
					return;
				}
				
				e.timeStamp = now;
				
				// gin user should put all code independent of canvas context in beforerender handler.
				// doing this can make best use of client cpu.
				if (!self._.framePrepared) {
					layer.beforerender();
					self._.framePrepared = true;
				}
				
				now = Date.now();
				_updateEventStats(e, now);
				
				// start rendering if it's time to do it.
				if (!frameCount || (now % 1000) - frameCount * self._.interval + GIN_INTERVAL_TOLERANCE >= 0) {
					e.timeStamp = now;
					layer.render();
					layer.updateStyle();
					
					stats.frameCount++;
					e.lastTime = now;
					self._.framePrepared = false;
				}
			}, 1);
			this._.state = GIN_STATE_STARTED;
			_debug('gin is started');
			
			return this;
		},
		pause: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.pause = hook;
				return this;
			}
			
			if (this._.state == GIN_STATE_PAUSED) {
				return this;
			}
			
			if (this._.state != GIN_STATE_STARTED) {
				_error('only GIN_STATE_STARTED can be started. [state: ' + this._.state + ']');
				return this;
			}
			
			if (this._.timer) {
				window.clearInterval(this._.timer);
				this._.timer = 0;
			}
			
			this._.hooks.pause.call(this.layer());
			this._.state = GIN_STATE_PAUSED;
			_debug('gin is paused');
			
			return this;
		},
		stop: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.stop = hook;
				return this;
			}
			
			if (this._.state == GIN_STATE_STOPPED) {
				return this;
			}
			
			if (this._.state != GIN_STATE_STARTED && this._.state != GIN_STATE_PAUSED) {
				_error('only GIN_STATE_STARTED and GIN_STATE_PAUSED can be stopped.'
					+ ' [state: ' + this._.state + ']');
				return this;
			}
			
			if (this._.timer) {
				window.clearInterval(this._.timer);
				this._.timer = 0;
			}
			
			this._.hooks.stop.call(this.layer());
			this._.state = GIN_STATE_STOPPED;
			_debug('gin is stopped');
			
			return this;
		},
		restart: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.restart = hook;
				return this;
			}
			
			if (this._.state != GIN_STATE_STARTED && this._.state != GIN_STATE_PAUSED) {
				_error('only GIN_STATE_STARTED and GIN_STATE_PAUSED can be restarted.'
					+ ' [state: ' + this._.state + ']');
				return this;
			}
			
			this._.hooks.restart.call(this.layer());
			this.stop();
			this.start();
			return this;
		},
		blur: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.blur = hook;
				return this;
			}
			
			this._.e.hasFocus = false;
			
			if (this._.autoPause) {
				this.pause();
			}
		},
		focus: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.focus = hook;
				return this;
			}
			
			this._.e.hasFocus = true;
			
			if (this._.autoPause) {
				this.start();
			}
		},
		resize: function(width, height) {
			var w = width || this._.element.clientWidth;
			var h = height || this._.element.clientHeight;
			
			if (isNaN(w) || w < 0 || isNaN(h) || h < 0) {
				_error('invalid width or height');
				return this;
			}
			
			var element = this._.element;
			var receiver = this._.receiver;
			var layer = this.layer();
			
			if (w != this._.width) {
				this._.width = w;
				receiver.style.width = w + 'px';
				layer.width(w);
				
				if (w != this._.element.clientWidth) {
					element.style.width = w + 'px';
					element.width = w;
				}
			}
			
			if (h != this._.height) {
				this._.height = h;
				receiver.style.height = h + 'px';
				layer.height(h);
				
				if (h != this._.element.clientHeight) {
					element.style.height = h + 'px';
					element.height = h;
				}
			}
		},
		cloneEvent: function() {
			var e = _deepClone(this._.e);
			e.mousemoveHistory = this._.mousemoveHistory;
			e.traverseHistory = _traverseHistory;
			e.offsetX = e.offsetY = 0;

			return e;
		}
	};
	
	Gin.prototype.init.prototype = Gin.prototype;
	return (window.$G = window.Gin = Gin);
})();

function GinLayer() {}
GinLayer.prototype = {
	create: function(settings, hooks) {
		var layer = new GinLayer();
		var s = settings || {};
		var h = hooks || {};

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
			_error('parent element must be set when parent is null');
			return;
		}
		
		var element = document.createElement('div');
		element.style.position = 'absolute';

		layer._ = {
			name: s.name,
			parent: s.parent,
			core: s.core,
			element: element,
			parentElement: s.parentElement,
			layers: {},
			styles: {},
			data: {},
			offsetX: 0,
			offsetY: 0,
			width: _getSetting(s.width, 0, GIN_REGEXP_INT, function(value) {
				if (value <= 0) {
					return;
				}
				
				element.style.width = value + 'px';
				return value;
			}),
			height: _getSetting(s.height, 0, GIN_REGEXP_INT, function(value) {
				if (value <= 0) {
					return;
				}
				
				element.style.height = value + 'px';
				return value;
			}),
			left: _getSetting(s.left, 0, GIN_REGEXP_INT, function(value) {
				if (value <= 0) {
					return;
				}
				
				element.style.left = value + 'px';
				return value;
			}),
			top: _getSetting(s.top, 0, GIN_REGEXP_INT, function(value) {
				if (value <= 0) {
					return;
				}
				
				element.style.top = value + 'px';
				return value;
			}),
			hooks: {
				beforerender: _parseHook(h, 'beforerender'),
				render: _parseHook(h, 'render'),
				destroy: _parseHook(h, 'destroy')
			}
		};
		
		if (s.parent) {
			layer._.offsetX = s.parent.offsetX + s.parent.left;
			layer._.offsetY = s.parent.offsetY + s.parent.top;
		}
		
		var canvas = document.createElement('canvas');
		canvas.style.width = layer._.width + 'px';
		canvas.style.height = layer._.height + 'px';
		canvas.width = layer._.width;
		canvas.height = layer._.height;
		element.appendChild(canvas);
		layer._.canvas = canvas;
		layer._.parentElement.appendChild(element);
		
		return layer;
	},
	layers: function(name, settings, hooks) {
		if (settings === undefined) {
			if (typeof name !== 'string' && !(name instanceof Array)) {
				_error('name must be string or array');
				return;
			}

			if (this._.layers[name]) {
				return this._.layers[name];
			}
			
			var names = name;
			
			if (typeof name === 'string') {
				names = name.split(GIN_REGEXP_BLANK);
			}
			
			var topLevelName = names.shift();
			
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
		
		var s = settings || {};
		
		if (!GIN_REGEXP_NAME.test(name)) {
			_error('invalid layer name. [name: ' + name + ']');
			return;
		}
		
		s.parent = this;
		s.parentElement = this._.element;
		s.core = this.core();
		s.name = name;
		var layer = this.create(s, hooks);
		
		if (!layer) {
			_error('cannot create new layer');
			return;
		}
		
		this._.layers[name] = layer;
		return layer;
	},
	name: function() {
		return this._.name;
	},
	parent: function() {
		return this._.parent;
	},
	top: function() {
		return this.core().layer();
	},
	core: function() {
		return this._.core;
	},
	style: function(property, value) {
		var styles = this._.styles;
		
		// white list mode. only support following styles.
		switch (property) {
		case 'width':
		case 'height':
		case 'top':
		case 'left':
			styles[property] = value + 'px';
		}

		return this;
	},
	left: function(val) {
		if (val === undefined) {
			return this._.left;
		}
		
		if (GIN_REGEXP_INT.test(val) && val > 0) {
			this._.left = parseInt(val, 10);
			this.style('left', this._.left);
		}
		
		return this;
	},
	top: function(val) {
		if (val === undefined) {
			return this._.top;
		}
		
		if (GIN_REGEXP_INT.test(val) && val > 0) {
			this._.top = parseInt(val, 10);
			this.style('top', this._.top);
		}
		
		return this;
	},
	width: function(val) {
		if (val === undefined) {
			return this._.width;
		}
		
		if (!this._.parent && !_verifyFriendMethod(arguments)) {
			_error('unauthorized call to this function');
			return this;
		}
		
		if (GIN_REGEXP_INT.test(val) && val > 0) {
			this._.width = parseInt(val, 10);
			this.style('width', this._.width);
		}
		
		return this;
	},
	height: function(val) {
		if (val === undefined) {
			return this._.height;
		}
		
		if (!this._.parent && !_verifyFriendMethod(arguments)) {
			_error('unauthorized call to this function');
			return this;
		}
		
		if (GIN_REGEXP_INT.test(val) && val > 0) {
			this._.height = parseInt(val, 10);
			this.style('height', this._.height);
		}
		
		return this;
	},
	draw: function(callback) {
		if (!(callback instanceof Function)) {
			_error('callback must be a function');
			return this;
		}
		
		var e = _cloneEvent.call(this);
		e.context = this._.canvas.getContext('2d');
		e.context.save();
		this._.hooks.render.call(this, e);
		e.context.restore();
		
		return this;
	},
	beforerender: function(hook) {
		if (hook instanceof Function) {
			this._.hooks.beforerender = hook;
			return this;
		}
		
		for (var i in this._.layers) {
			this._.layers[i].beforerender();
		}
		
		if (this._.hooks.beforerender == GIN_FUNC_DUMMY) {
			return this;
		}
		
		this._.hooks.render.call(this, _cloneEvent.call(this));
		return this;
	},
	render: function(hook) {
		if (hook instanceof Function) {
			this._.hooks.render = hook;
			return this;
		}
		
		if (this._.hooks.render != GIN_FUNC_DUMMY) {
			this.draw(this._.hooks.render);
		}
		
		for (var i in this._.layers) {
			this._.layers[i].render();
		}
		
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
	updateStyle: function() {
		for (var i in this._.layers) {
			this._.layers[i].updateStyle();
		}
		
		if (_emptyObject(this._.styles)) {
			return this;
		}
		
		var styles = this._.styles;
		var element = this._.element;
		var canvas = this._.canvas;
		
		for (var i in styles) {
			this._.element.style[i] = styles[i];
		}
		
		for (var i in styles) {
			switch (i) {
			case 'top':
			case 'left':
				break;
			case 'width':
			case 'height':
				canvas[i] = parseInt(styles[i], 10);
			default:
				canvas.style[i] = styles[i];
			}
		}
		
		this._.styles = {};
		return this;
	},
	data: function(key, value) {
		if (key === undefined) {
			_error('data key cannot be undefined');
			return;
		}
		
		if (value === undefined) {
			return this._.data[key];
		}
		
		this._.data[key] = value;
		return this;
	},
	destroy: function(hook) {
		if (hook instanceof Function) {
			this._.hooks.destroy = hook;
			return this;
		}
		
		for (var i in this._.layers) {
			this._.layers[i].destroy();
		}
		
		var parent = this._.parent;
		
		if (parent) {
			parent.remove(this.name());
		}
	}
};

function GinEvent() {}
GinEvent.prototype = {
	create: function(e) {
	},
};

var _specialKeys = [];
_specialKeys[GIN_VK_SHIFT] = true;
_specialKeys[GIN_VK_CTRL] = true;
_specialKeys[GIN_VK_ALT] = true;

function _deepClone(obj) {
	var newObject = new obj.constructor();
	newObject.__proto__ = obj;
	
	for (var i in newObject) {
		if (typeof newObject[i] === 'object') {
			newObject[i] = _deepClone(newObject[i]);
		}
	}
	
	return newObject;
};

var _debug = function() {
	try {
		console.debug.apply(console, arguments);
	} catch (e) {
	}
};

var _error = function() {
	try {
		console.error.apply(console, arguments);
	} catch (e) {
	}
};

var _updateEventStats = function(e, now) {
	var stats = e.stats;
	var frameCount = stats.frameCount;
	var currentSecond = Math.floor(now / 1000);
	var lastSecond = Math.floor(e.lastTime / 1000);
	
	if (currentSecond != lastSecond && frameCount) {
		_debug('fps: ' + frameCount + '   mousemove per second: ' + stats.mousemoveCount);
		stats.frameCount = 0;
		stats.mousemoveCount = 0;
	}
};

var _getSetting = function(value, defValue, regexp, action) {
	var r = regexp instanceof RegExp? regexp: null;
	var a = action instanceof Function? action:
		regexp instanceof Function? regexp: GIN_FUNC_DUMMY;
	var val;
	
	if (value !== undefined && (!r || r.test(value))) {
		val = a(value);
	}
	
	return val === undefined? defValue: val;
};

var _parseHook = function(hooks, item) {
	if (hooks[item] instanceof Function) {
		return hooks[item];
	}
	
	return GIN_FUNC_DUMMY;
};

var _keyboardHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e;
	var isDown = e.type === 'keydown'? true: false;
	e.stopPropagation();
	
	if (!_specialKeys[e.keyCode]) {
		evt.keyStates[e.keyCode] = isDown;
	}
	
	evt.shiftKey = e.shiftKey;
	evt.altKey = e.altKey;
	evt.ctrlKey = e.ctrlKey;
	evt.metaKey = e.metaKey;
};

var _mousemoveHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e;
	var history = this._.core._.mousemoveHistory;
	var last = history[history.last];
	
	if (!last || last.clientX != e.clientX || last.clientY != e.clientY) {
		evt.clientX = e.clientX;
		evt.clientY = e.clientY;
		evt.mouseover = true;
		evt.stats.mousemoveCount++;
		
		history.current = (history.current + 1) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY;
		history.length = history.length < GIN_EVENT_MOUSEMOVE_MAX_HISTORY?
			history.length + 1: GIN_EVENT_MOUSEMOVE_MAX_HISTORY;
		
		if (history.current == history.last) {
			history.last++;
		}
		
		history[history.current] = {
			clientX: e.clientX,
			clientY: e.clientY,
			timeStamp: Date.now()
		};
	}
};

var _mousebuttonHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e;
	var isDown = e.type === 'mousedown'? true: false;
	evt.buttonStates[e.button] = isDown;
	
	if (isDown) {
		e.preventDefault();
	}
};

var _mouseCaptureHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e;
	evt.mouseover = evt.type == 'mouseover'? true: false;
	
	if (!evt.mouseover) {
		evt.buttonStates = [];
	}
};

var _contextmenuHandler = function(e) {
	e.preventDefault();
};

var _blurHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	this._.core.blur();
};

var _focusHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	this._.core.focus();
};

var _cloneEvent = function() {
	var e = this.core().cloneEvent();
	e.layerName = this._.name;
	
	if (this._.parent) {
		this._.offsetX = this._.parent.offsetX + this._.parent.left;
		this._.offsetY = this._.parent.offsetY + this._.parent.top;
	}
	
	e.offsetX = this._.offsetX + this._.left;
	e.offsetY = this._.offsetY + this._.top;
	e.clientX -= e.offsetX;
	e.clientY -= e.offsetY;
	e.layer = this;
	
	return e;
};

// traverse all mouse move events since last rendering.
// it will reset mousemoveHistory last position.
var _traverseHistory = function(callback) {
	if (!this.mousemoveHistory || !(callback instanceof Function)) {
		return this;
	}
	
	var history = this.mousemoveHistory;
	var current = history.current;
	var last = history.last;
	
	// history is empty.
	if (current == last) {
		return this;
	}
	
	var i = last;
	
	do {
		i = (i + 1) % GIN_EVENT_MOUSEMOVE_MAX_HISTORY;
		callback.call(this.layer, {
			clientX: history[i].clientX - this.offsetX,
			clientY: history[i].clientY - this.offsetY,
			timeStamp: history[i].timeStamp
		});
	} while (i != current);
	
	history.last = history.current;
	
	return this;
};

var _setFriendMethod = function(caller, callee) {
	caller._friends = caller._friends || [];
	caller._friends.push(callee.toString());
	return caller;
};

var _verifyFriendMethod = function(args) {
	try {
		var callee = args.callee;
		var caller = callee.caller
		
		if (!caller || !caller._friends) {
			return false;
		}
		
		var calleeString = callee.toString();
		var friends = caller._friends;
		
		for (var i in friends) {
			if (friends[i] === calleeString) {
				return true;
			}
		}
		
		return false;
	} catch (e) {
		return false;
	}
};

var _emptyObject = function(obj) {
	if (obj instanceof Array) {
		return obj.length == 0;
	}
	
	for (var i in obj) {
		return false;
	}
	
	return true;
};
})(window);
