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

const VK_SHIFT = 16;
const VK_CTRL = 17;
const VK_ALT = 18;
const VK_CAPSLOCK = 20;

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
			
			settings = settings || {};
			hooks = hooks || {};
			
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
			
			this._ = {};
			this._.element = element;
			element._ = {};
			element._.core = this;
			this._.hooks = {};
			this._.state = GIN_STATE_INIT;
			this._.framePrepared = false;
			this._.frameRenderedPerSecond = 0;
			this._.frameRenderingTimeInSecond = 0;
			this._.e = {};
			this._.e.keyStates = [];
			this._.e.buttonStates = [];
			this._.e.startTime = Date.now();
			this._.e.lastTime = this._.e.startTime;
			this._.e.stats = {};
			this._.e.stats.frameCount = 0;
			this._.e.stats.mousemoveCount = 0;
			this._.e.clientX = 0;
			this._.e.clientY = 0;
			this._.e.mouseover = false;
			this._.e.hasFocus = true;
			
			this._.fps = GIN_FPS_DEFAULT;
			_parseIntSetting.call(this, settings, 'fps', function(value) {
				if (value < GIN_FPS_MIN || value > GIN_FPS_MAX) {
					_error('fps setting must in range of ['
						+ GIN_FPS_MIN + ', ' + GIN_FPS_MAX + ']. [fps: ' + value + ']');
					return;
				}
				
				this._.fps = value;
			});
			this._.interval = 1000. / this._.fps;
			
			this._.width = element.clientWidth;
			_parseIntSetting.call(this, settings, 'width', function(value) {
				if (value <= 0) {
					return;
				}
				
				this._.element.style.width = value + 'px';
				this._.element.width = value;
				this._.width = value;
			});
			
			this._.height = element.clientHeight;
			_parseIntSetting.call(this, settings, 'height', function(value) {
				if (value <= 0) {
					return;
				}
				
				this._.element.style.height = value + 'px';
				this._.element.height = value;
				this._.height = value;
			});
			
			this._.autoPause = false;
			_parseSetting(this, settings, 'autoPause', function(value) {
				if (value === true) {
					this._.autoPause = value;
				}
			});
			
			var autoStart = true;
			_parseSetting(this, settings, 'autoStart', function(value) {
				if (value === false) {
					autoStart = value;
				}
			});
			
			this._.hooks.start = _parseHook(hooks, 'start');
			this._.hooks.pause = _parseHook(hooks, 'pause');
			this._.hooks.stop = _parseHook(hooks, 'stop');
			this._.hooks.restart = _parseHook(hooks, 'restart');
			this._.hooks.blur = _parseHook(hooks, 'blur');
			this._.hooks.focus = _parseHook(hooks, 'focus');
			
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
				beforerender: hooks.beforerender,
				render: hooks.render,
				destroy: function() {
					this.core().stop();
				}
			});
			
			if (!layer) {
				_error('cannot create default layer instance');
				return;
			}
			
			_setFriendMethod(this.resize, layer.width);
			_setFriendMethod(this.resize, layer.height);
			this._.layer = layer;
			
			element.focus();
			element.addEventListener('blur', _blurHandler, false);
			element.addEventListener('focus', _focusHandler, false);
			element.addEventListener('keydown', _keyboardHandler, false);
			element.addEventListener('keyup', _keyboardHandler, false);
			element.addEventListener('mouseover', _mouseCaptureHandler, false);
			element.addEventListener('mouseout', _mouseCaptureHandler, false);
			element.addEventListener('mousedown', _mousebuttonHandler, false);
			element.addEventListener('mouseup', _mousebuttonHandler, false);
			element.addEventListener('contextmenu', _contextmenuHandler, false);
			element.addEventListener('mousemove', _mousemoveHandler, false);
			
			var self = this;
			window.setInterval(function() {self.resize();}, 100);
			
			if (autoStart) {
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
				var stats = self._.e.stats;
				var frameCount = stats.frameCount;
				var currentSecond = Math.floor(now / 1000);
				var lastSecond = Math.floor(self._.e.lastTime / 1000);
				
				if (currentSecond != lastSecond && frameCount) {
					_debug('fps: ' + frameCount + '   mousemove per second: ' + stats.mousemoveCount);
					stats.frameCount = 0;
					stats.mousemoveCount = 0;
				}
				
				if (frameCount >= fps && self._.framePrepared) {
					return;
				}
				
				self._.e.timeStamp = now;
				
				if (!self._.framePrepared) {
					self.layer().beforerender();
					self._.framePrepared = true;
				}
				
				now = Date.now();
				
				if ((now % 1000) - frameCount * self._.interval + GIN_INTERVAL_TOLERANCE > 0) {
					self._.e.timeStamp = now;
					self.layer().render();
					
					stats.frameCount++;
					self._.e.lastTime = now;
					self._.framePrepared = false;
				}
			}, 1);
			this._.state = GIN_STATE_STARTED;
			
			return this;
		},
		pause: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.pause = hook;
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
			
			return this;
		},
		stop: function(hook) {
			if (hook instanceof Function) {
				this._.hooks.stop = hook;
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
			var layer = this.layer();
			
			if (w != this._.width) {
				this._.width = w;
				layer.width(w);
				
				if (w != this._.element.clientWidth) {
					element.style.width = w + 'px';
					element.width = w;
				}
			}
			
			if (h != this._.height) {
				this._.height = h;
				layer.height(h);
				
				if (h != this._.element.clientHeight) {
					element.style.height = h + 'px';
					element.height = h;
				}
			}
		},
		cloneEvent: function() {
			return _deepClone(this._.e);
		}
	};
	
	Gin.prototype.init.prototype = Gin.prototype;
	return (window.$G = window.Gin = Gin);
})();

function GinLayer() {}
GinLayer.prototype = {
	create: function(settings, hooks) {
		var layer = new GinLayer();
		layer._ = {};
		layer._.hooks = {};
		layer._.layers = {};
		layer._.styles = {};
		layer._.data = {};
		settings = settings || {};
		hooks = hooks || {};
		
		if (settings.parent !== null && !(settings.parent instanceof GinLayer)) {
			_error('parent must be GinLayer instance or null');
			return;
		}
		
		layer._.parent = settings.parent;
		
		if (!settings.core) {
			_error('core must be set');
			return;
		}
		
		layer._.core = settings.core;
		
		if (!settings.name) {
			_error('layer must have a name');
			return;
		}
		
		layer._.name = settings.name;
		
		if (!settings.parentElement) {
			_error('parent element must be set when parent is null');
			return;
		}
		
		layer._.parentElement = settings.parentElement;
		
		var element = document.createElement('div');
		element.style.position = 'absolute';
		layer._.element = element;

		_parseIntSetting.call(layer, settings, 'width', function(value) {
			if (value <= 0) {
				return;
			}
			
			this._.element.style.width = value + 'px';
			this._.width = value;
		});
		
		if (layer._.width === undefined) {
			layer._.width = layer._.parentElement.clientWidth;
		}

		_parseIntSetting.call(layer, settings, 'height', function(value) {
			if (value <= 0) {
				return;
			}
			
			this._.element.style.height = value + 'px';
			this._.height = value;
		});
		
		if (layer._.height === undefined) {
			layer._.height = layer._.parentElement.clientHeight;
		}

		layer._.left = 0;
		_parseIntSetting.call(layer, settings, 'left', function(value) {
			if (value <= 0) {
				return;
			}
			
			this._.element.style.left = value + 'px';
			this._.left = value;
		});

		layer._.top = 0;
		_parseIntSetting.call(layer, settings, 'top', function(value) {
			if (value <= 0) {
				return;
			}
			
			this._.element.style.top = value + 'px';
			this._.top = value;
		});
		
		if (layer._.parent) {
			layer._.offsetX = layer._.parent.offsetX + layer._.parent.left;
			layer._.offsetY = layer._.parent.offsetY + layer._.parent.top;
		} else {
			layer._.offsetX = 0;
			layer._.offsetY = 0;
		}
		
		layer._.hooks.beforerender = _parseHook(hooks, 'beforerender');
		layer._.hooks.render = _parseHook(hooks, 'render');
		layer._.hooks.destroy = _parseHook(hooks, 'destroy');
		
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
				names = name.split(_layerBlankRegex);
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
		
		if (!_layerNameRegex.test(name)) {
			_error('invalid layer name. [name: ' + name + ']');
			return;
		}
		
		settings.parent = this;
		settings.parentElement = this._.element;
		settings.core = this.core();
		settings.name = name;
		var layer = this.create(settings, hooks);
		
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
		// TODO: apply style at rendering
		switch (property) {
		case 'width':
		case 'height':
			this._.canvas.style[property] = value + 'px';
			this._.canvas[property] = value;
		case 'top':
		case 'left':
			this._.element.style[property] = value + 'px';
			this._.element[property] = value;
		}

		// TODO: finish it
	},
	left: function(val) {
		if (val === undefined) {
			return this._.left;
		}
		
		if (_layerIntRegex.test(val) && val > 0) {
			this._.left = parseInt(val, 10);
			this.style('left', this._.left);
		}
		
		return this;
	},
	top: function(val) {
		if (val === undefined) {
			return this._.top;
		}
		
		if (_layerIntRegex.test(val) && val > 0) {
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
		
		if (_layerIntRegex.test(val) && val > 0) {
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
		
		if (_layerIntRegex.test(val) && val > 0) {
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
		
		if (this._.hooks.beforerender == _dummyCallback) {
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
		
		if (this._.hooks.render != _dummyCallback) {
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
		
		for (var i in styles) {
			this._.element.style[i] = styles[i];
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

var _layerNameRegex = /^[a-zA-Z_\-][a-zA-Z_0-9\-]*$/;
var _layerBlankRegex = /\s+/;
var _layerIntRegex = /^\d+$/;

var _specialKeys = [];
_specialKeys[VK_SHIFT] = true;
_specialKeys[VK_CTRL] = true;
_specialKeys[VK_ALT] = true;

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
	if (console) {
		try {
			console.debug.apply(console, arguments);
		} catch (e) {
		}
	}
};

var _error = function() {
	if (console) {
		try {
			console.error.apply(console, arguments);
		} catch (e) {
		}
	}
};

var _parseSetting = function(settings, item, action) {
	if (settings[item] !== undefined && action instanceof Function) {
		return action.call(this, settings[item]);
	}
};

var _parseIntSetting = function(settings, item, action) {
	var value = settings[item];
	
	if (value !== undefined && _layerIntRegex.test(value)
		&& action instanceof Function) {
		return action.call(this, value);
	}
};

var _parseHook = function(hooks, item) {
	if (hooks[item] instanceof Function) {
		return hooks[item];
	}
	
	return _dummyCallback;
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
	evt.clientX = e.clientX;
	evt.clientY = e.clientY;
	evt.mouseover = true;

	evt.stats.mousemoveCount++;
};

var _mousebuttonHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	_mousemoveHandler.call(this, e);
	
	var evt = this._.core._.e;
	var isDown = e.type === 'mousedown'? true: false;
	evt.buttonStates[e.button] = isDown;
};

var _mouseCaptureHandler = function(e) {
	if (!this._ || !this._.core) {
		_error('cannot find GinCore information');
		return;
	}
	
	_mousemoveHandler.call(this, e);
	
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
	
	e.clientX -= this._.offsetX + this._.left;
	e.clientY -= this._.offsetY + this._.top;
	
	return e;
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

var _dummyCallback = function() {};

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
