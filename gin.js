/*!
 * gin JavaScript Library v1.0.0
 * https://github.com/huandu/gin/
 *
 * Copyright 2011, Huan Du
 * Licensed under the MIT license
 * https://github.com/huandu/gin/blob/master/LICENSE
 */

/*#{{
replace /_debug\(/ //_debug(
replace /_error\(/ //_error(
}}#*/

(function(window, undefined){
const GIN_FPS_DEFAULT = 30;
const GIN_FPS_MIN = 1;
const GIN_FPS_MAX = 100;

const GIN_STATE_INIT = 1;
const GIN_STATE_STARTED = 2;
const GIN_STATE_PAUSED = 3;
const GIN_STATE_STOPPED = 4;

const GIN_MOUSESTATE_MOVE = 1;
const GIN_MOUSESTATE_DOWN = 2;
const GIN_MOUSESTATE_UP = 3;

const GIN_INTERVAL_TOLERANCE = 5;

const GIN_RESIZE_INTERVAL = 100;

const GIN_REGEXP_NAME = /^[a-zA-Z_\-][a-zA-Z_0-9\-]*$/;
const GIN_REGEXP_BLANK = /\s+/;
const GIN_REGEXP_NUMBER = /^-?\d+(\.\d*)?$/;
const GIN_REGEXP_ANY = /.*/;

const GIN_EVENT_MOUSEMOVE_MAX_HISTORY = 300;

const GIN_FUNC_DUMMY = function() {};

const GIN_VK_SHIFT = 16;
const GIN_VK_CTRL = 17;
const GIN_VK_ALT = 18;
const GIN_VK_CAPSLOCK = 20;

const GIN_ZINDEX_EVENT_LAYER = 10000;
const GIN_ZINDEX_DIALOG_LAYER = GIN_ZINDEX_EVENT_LAYER + 1;

var document = window.document;

var Gin = (function(){
	var Gin = function(id, settings, listeners) {
		return new Gin.prototype.init(id, settings, listeners);
	};
	
	Gin.prototype = {
		init: function(id, settings, listeners) {
			if (!id) {
				_error('id cannot be empty');
				return;
			}
			
			var s = settings || {},
				h = listeners || {},
				element;
			
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
				frameCountInSecond: 0,
				lastResize: now,
				e: {
					keyStates: [],
					buttonStates: [],
					startTime: now,
					lastTime: now,
					stats: {
						frameCount: 0,
						mousemoveCount: 0,
						fps: 0,
						mps: 0
					},
					clientX: 0,
					clientY: 0,
					mouseover: false,
					hasFocus: true,
				},
				mousemoveHistory: {
					current: 0,
					last: 0,
					traverseLast: 0,
					length: 0
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
				beforerender: _parseListener(h, 'beforerender'),
				render: _parseListener(h, 'render'),
				size: _parseListener(h, 'size'),
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
			receiver.style.zIndex = GIN_ZINDEX_EVENT_LAYER;
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
		start: function(listener) {
			if (listener instanceof Function) {
				this._.listeners.start = listener;
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
			
			this._.listeners.start.call(this.layer());
			this._.frameRenderingTimeInSecond = Date.now() % 1000;
			var layer = this.layer(),
				self = this;
			
			this._.timer = window.setInterval(function() {
				var now = Date.now(),
					fps = self._.fps,
					e = self._.e,
					stats = self._.e.stats,
					layer = self.layer(),
					history = self._.mousemoveHistory;
				
				_updateEventStats.call(self._, e, now);
				
				// frame rendered in 1s must be always lower than fps in setting.
				if (self._.frameCountInSecond >= fps && self._.framePrepared) {
					return;
				}
				
				e.timeStamp = now;
				
				// gin user should put all code independent of canvas context in beforerender handler.
				// doing this can make best use of client cpu.
				if (!self._.framePrepared) {
					history.traverseLast = history.last;
					layer.beforerender();
					self._.framePrepared = true;
				}
				
				now = Date.now();
				_updateEventStats.call(self._, e, now);
				
				// start rendering if it's time to do it.
				if (!self._.frameCountInSecond
					|| (now % 1000) - self._.frameCountInSecond * self._.interval + GIN_INTERVAL_TOLERANCE >= 0) {
					e.timeStamp = now;
					history.traverseLast = history.last;
					layer.render();

					if (now - self._.lastResize > GIN_RESIZE_INTERVAL) {
						self.resize();
						self._.lastResize = now;
					}
					
					layer.updateStyle();
					
					stats.frameCount++;
					self._.frameCountInSecond++;
					e.lastTime = now;
					self._.framePrepared = false;
				}
			}, 1);
			this._.state = GIN_STATE_STARTED;
			_debug('gin is started');
			
			return this;
		},
		pause: function(listener) {
			if (listener instanceof Function) {
				this._.listeners.pause = listener;
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
			
			this._.listeners.pause.call(this.layer());
			this._.state = GIN_STATE_PAUSED;
			_debug('gin is paused');
			
			return this;
		},
		stop: function(listener) {
			if (listener instanceof Function) {
				this._.listeners.stop = listener;
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
			
			this._.listeners.stop.call(this.layer());
			this._.state = GIN_STATE_STOPPED;
			_debug('gin is stopped');
			
			return this;
		},
		restart: function(listener) {
			if (listener instanceof Function) {
				this._.listeners.restart = listener;
				return this;
			}
			
			if (this._.state != GIN_STATE_STARTED && this._.state != GIN_STATE_PAUSED) {
				_error('only GIN_STATE_STARTED and GIN_STATE_PAUSED can be restarted.'
					+ ' [state: ' + this._.state + ']');
				return this;
			}
			
			this._.listeners.restart.call(this.layer());
			this.stop();
			this.start();
			return this;
		},
		blur: function(listener) {
			if (listener instanceof Function) {
				this._.listeners.blur = listener;
				return this;
			}
			
			if (this._.e.hasFocus) {
				this._.e.hasFocus = false;
				this._.e.keyStats = [];
				
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
			
			if (!this._.e.hasFocus) {
				this._.e.hasFocus = true;
				
				if (this._.autoPause) {
					this.start();
				}
			}
		},
		resize: function(width, height) {
			var w = width || this._.element.clientWidth,
				h = height || this._.element.clientHeight;
			
			if (isNaN(w) || w < 0 || isNaN(h) || h < 0) {
				_error('invalid width or height');
				return this;
			}
			
			var element = this._.element,
				receiver = this._.receiver,
				layer = this.layer(),
				needResize = false;
			
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
				layer.size();
			}
		},
		width: function() {
			return this._.width;
		},
		height: function() {
			return this._.height;
		},
		cloneEvent: function() {
			var e = _deepClone(this._.e);
			e.mousemoveHistory = this._.mousemoveHistory;
			e.traverseHistory = _traverseHistory;
			e.clearHistory = _clearHistory;
			e.offsetX = e.offsetY = 0;

			return e;
		}
	};
	
	Gin.prototype.init.prototype = Gin.prototype;
	return (window.$G = window.Gin = Gin);
})();

function GinLayer() {}
GinLayer.prototype = {
	create: function(settings, listeners) {
		var layer = new GinLayer(),
			s = settings || {},
			h = listeners || {};

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
		element.style.display = 'block';

		layer._ = {
			name: s.name,
			parent: s.parent,
			core: s.core,
			element: element,
			parentElement: s.parentElement,
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
					if (value <= 0) {
						return;
					}
					
					element.style.left = value + 'px';
					return value;
				}),
				top: _getSetting(s.top, 0, GIN_REGEXP_NUMBER, function(value) {
					if (value <= 0) {
						return;
					}
					
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
			layer._.offsetX = s.parent.offsetX + s.parent.left;
			layer._.offsetY = s.parent.offsetY + s.parent.top;
		}
		
		var canvas = document.createElement('canvas');
		canvas.style.position = 'absolute';
		canvas.style.left = 0;
		canvas.style.top = 0;
		canvas.style.width = layer._.style.width + 'px';
		canvas.style.height = layer._.style.height + 'px';
		canvas.width = layer._.style.width;
		canvas.height = layer._.style.height;
		element.appendChild(canvas);
		layer._.canvas = canvas;
		layer._.parentElement.appendChild(element);
		
		if (layer._.attachment) {
			element.appendChild(layer._.attachment);
		}
		
		if (_getSetting(s.hidden, false, function(value) {
				return value === true? value: undefined;
			})) {
			layer.hide();
		}
		
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
	},
	layers: function(name, settings, listeners) {
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
		var layer = this.create(s, listeners);
		
		if (!layer) {
			_error('cannot create new layer');
			return;
		}
		
		this._.layers[name] = layer;
		return this;
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
		
		var e = _GinLayer_cloneEvent.call(this);
		e.context = this._.canvas.getContext('2d');
		e.context.save();
		callback.call(this, e);
		e.context.restore();
		_GinLayer_fixOffset.call(this);
		
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
		if (this._.parent) {
			this._.parent.remove(this._.name);
		}
		
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
		layer._.parent = this;
		layer._.detached = false;
		return this;
	},
	attachTo: function(layer) {
	},
	updateStyle: function() {
		for (var i in this._.layers) {
			this._.layers[i].updateStyle();
		}
		
		var style = this._.newStyle,
			element = this._.element,
			canvas = this._.canvas;
		
		if (_emptyObject(style)) {
			return this;
		}
		
		for (var i in style) {
			this._.element.style[i] = style[i];
			this._.style[i] = Math.round(parseFloat(style[i]));
		}
		
		for (var i in style) {
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
		
		this._.data[key] = value;
		
		if (hook instanceof Function) {
			this._.dataHooks[key] = hook;
		}
		
		if (this._.dataHooks[key]) {
			this._.dataHooks[key].call(this, value);
		}
		
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
	}
};

var _GinLayer_cloneEvent = function() {
	var e = this.core().cloneEvent();
	e.layerName = this._.name;
	
	if (this._.parent) {
		this._.offsetX = this._.parent._.offsetX + this._.parent.left();
		this._.offsetY = this._.parent._.offsetY + this._.parent.top();
	}
	
	e.offsetX = this._.offsetX + this.left();
	e.offsetY = this._.offsetY + this.top();
	e.clientX -= e.offsetX;
	e.clientY -= e.offsetY;
	e.layer = this;
	
	return e;
};

var _GinLayer_fixOffset = function() {
	var element = this.element(),
		left = element.style.left || 0,
		top = element.style.top || 0;
	
	if (this.left() != Math.round(parseFloat(left, 10))) {
		this.left(left);
	}
	
	if (this.top() != Math.round(parseFloat(top, 10))) {
		this.top(top);
	}
};

var _GinLayer_addOrCallListener = function(name, listener, callMe, callChild, action) {
	if (listener instanceof Function) {
		this._.listeners[name] = listener;
		return this;
	}
	
	var e = undefined;
	
	if ((callChild || callMe) && action) {
		e = action.call(this)
	}
	
	if (callChild) {
		for (var i in this._.layers) {
			this._.layers[i][name].call(this._.layers[i], e);
		}
	}
	
	if (callMe && this._.listeners[name] != GIN_FUNC_DUMMY) {
		this._.listeners[name].call(this, e);
	}
	
	return this;
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
},

_error = function() {
	try {
		console.error.apply(console, arguments);
	} catch (e) {
	}
},

_updateEventStats = function(e, now) {
	var stats = e.stats,
		currentSecond = Math.floor(now / 1000),
		lastSecond = Math.floor(e.lastTime / 1000);
	
	if (currentSecond != lastSecond && this.frameCountInSecond) {
		stats.fps = this.frameCountInSecond;
		stats.mps = stats.mousemoveCount;
		this.frameCountInSecond = 0;
		stats.mousemoveCount = 0;
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
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e,
		isDown = e.type === 'keydown'? true: false;
	e.stopPropagation();
	e.preventDefault();
	
	if (!_specialKeys[e.keyCode]) {
		evt.keyStates[e.keyCode] = isDown;
	}
	
	evt.shiftKey = e.shiftKey;
	evt.altKey = e.altKey;
	evt.ctrlKey = e.ctrlKey;
	evt.metaKey = e.metaKey;
},

_mousemoveHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e,
		history = this._.core._.mousemoveHistory,
		last = history[history.last],
		mouseState = e.mouseState || GIN_MOUSESTATE_MOVE;
	
	if (!last || last.clientX != e.clientX || last.clientY != e.clientY || mouseState != last.mouseState || history.last == history.current) {
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
			mouseState: e.mouseState,
			button: e.button,
			timeStamp: Date.now()
		};
	}
},

_mousebuttonHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e,
		isDown = e.type === 'mousedown'? true: false;
	evt.buttonStates[e.button] = isDown;
	
	e.preventDefault();
	e.mouseState = isDown? GIN_MOUSESTATE_DOWN: GIN_MOUSESTATE_UP;
	_mousemoveHandler.call(this, e);
},

_mouseCaptureHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	var evt = this._.core._.e;
	evt.mouseover = evt.type == 'mouseover'? true: false;
	
	if (!evt.mouseover) {
		evt.buttonStates = [];
	}
},

_contextmenuHandler = function(e) {
	e.preventDefault();
},

_blurHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	this._.core.blur();
},

_focusHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	this._.core.focus();
},

// traverse all mouse move events since last rendering.
_traverseHistory = function(callback) {
	if (!(callback instanceof Function)) {
		return this;
	}
	
	var history = this.mousemoveHistory,
		current = history.current,
		last = history.traverseLast,
		i = last,
		cur = null,
		prev = history[i];
	
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
		
		callback.call(this.layer, cur, prev);
		prev = cur;
	} while (i != current);
	
	return this;
},

// clear mouse move history.
// by default, it will not clear history until calling next beforerender/render.
_clearHistory = function() {
	if (!this.mousemoveHistory) {
		return this;
	}
	
	var history = this.mousemoveHistory;
	history.last = history.current;
	
	return this;
},

_setFriendMethod = function(caller, callee) {
	caller._friends = caller._friends || [];
	caller._friends.push(callee.toString());
	return caller;
},

_verifyFriendMethod = function(args) {
	try {
		var callee = args.callee,
			caller = callee.caller
		
		if (!caller || !caller._friends) {
			return false;
		}
		
		var calleeString = callee.toString(),
			friends = caller._friends;
		
		for (var i in friends) {
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
	if (obj instanceof Array) {
		return obj.length == 0;
	}
	
	for (var i in obj) {
		return false;
	}
	
	return true;
},

_;
})(window);
