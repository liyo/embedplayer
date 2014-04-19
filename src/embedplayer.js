// $('.videos').embedplayer(); // just initilaize APIs
// $('.videos').embedplayer('listen','ready play pause finish buffering timeupdate');
// $('.videos').embedplayer('play');
// $('.videos').embedplayer('pause');
// $('.videos').embedplayer('stop');
// $('.videos').embedplayer('volume',value);
// $('.videos').embedplayer('volume') -> Number;
// $('.videos').embedplayer('currenttime') -> Number;
// $('.videos').embedplayer('duration') -> Number;
// $('.videos').embedplayer('state') -> "init" or "ready" or "playing" or "paused" or "finished" or "buffering";
// $('.videos').embedplayer('link') -> String;
// $('.videos').on('embedplayer:ready', handler);
// $('.videos').on('embedplayer:play', handler);
// $('.videos').on('embedplayer:pause', handler);
// $('.videos').on('embedplayer:finish', handler);
// $('.videos').on('embedplayer:buffering', handler);
// $('.videos').on('embedplayer:statechange', handler);
// $('.videos').on('embedplayer:timeupdate', handler);

(function ($, undefined) {
	"use strict";

	$.embedplayer = {
		next_player_id: 1,
		modules: [],
		modules_by_origin: {},
		defaults: {
			matches: function () { return false; },
			init: function (data) {},
			play: function (data) {},
			pause: function (data) {},
			stop: function (data) {},
			listen: function (data,events) {},
			volume: function (data) { return NaN; },
			setVolume: function (data,volume) {},
			duration: function (data) { return NaN; },
			currenttime: function (data) { return NaN; },
			seek: function (data,position) {},
			link: function (data) { return null; },
			parseMessage: function (event) {},
			processMessage: function (data,message,trigger) {},
			origin: []
		},
		register: function (module) {
			module = make_module(module);
			$.embedplayer.modules.push(module);
			for (var origin in module.origin) {
				if (origin in $.embedplayer.modules_by_origin) {
					throw new TypeError("already have embedplayer module for origin: "+origin);
				}
				$.embedplayer.modules_by_origin[origin] = module;
			}
		},
		origin: function (url) {
			if (/^\/\//.test(url)) {
				return location.protocol+"//"+url.split("/")[2];
			}
			else if (/^[-_a-z0-9]+:/i.test(url)) {
				return /^([-_a-z0-9]+:(?:\/\/)?[^\/]*)/i.exec(url)[1];
			}
			else {
				return location.protocol+'//'+location.host;
			}
		}
	};

	function make_module (module) {
		module = $.extend({}, $.embedplayer.defaults, module);
		var origin = {};
		if (module.origin) {
			if (!$.isArray(module.origin)) {
				module.origin = [module.origin];
			}
			for (var i = 0; i < module.origin.length; ++ i) {
				var origin = module.origin[i];
				if (/^\/\//.test(origin)) {
					origin[location.protocol+origin] = true;
				}
				else {
					origin[origin] = true;
				}
			}
		}
		module.origin = origin;
		return module;
	}

	function init (self,options) {
		var data = $.data(self,'embedplayer');
		if (!data) {
			var module = null;

			if (options) {
				module = make_module(options);
				for (var origin in module.origin) {
					if (origin in $.embedplayer.modules_by_origin) {
						throw new TypeError("already have embedplayer module for origin: "+origin);
					}
					$.embedplayer.modules_by_origin[origin] = module;
				}
			}
			else {
				for (var i = 0; i < $.embedplayer.modules.length; ++ i) {
					var candidate = $.embedplayer.modules[i];
					if (candidate.matches.call(self)) {
						module = candidate;
						break;
					}
				}
			}

			if (!module) {
				throw new TypeError("unsupported embed");
			}

			data = {
				player_id: $.embedplayer.next_player_id ++,
				module: module,
				state: 'init',
				listening: {
					ready: false,
					play: false,
					pause: false,
					finish: false,
					buffering: false,
					timeupdate: false
				},
				detail: {}
			};

			$.data(self,'embedplayer',data);
			$.attr(self,'data-embedplayer-id',String(data.player_id));

			var ok = false;
			try {
				module.init.call(self,data);
				ok = true;
			}
			finally {
				if (!ok) {
					// do it like that because catch and re-throw
					// changes the stack trace in some browsers
					$.removeData(self,'embedplayer');
					$.removeAttr(self,'data-embedplayer-id');
				}
			}
		}
		return data;
	}

	$.fn.embedplayer = function (command, options) {
		if (arguments.length === 0) {
			command = "init";
		}
		else if (arguments.length === 1 && typeof(command) === "object") {
			options = command;
			command = "init";
		}

		switch (command) {
		case "init":
			this.each(function () { init(this,options); });
			break;

		case "play":
		case "pause":
		case "stop":
			this.each(function () {
				var data = init(this,options);
				data.module[command].call(this,data);
			});
			break;

		case "listen":
			var events = arguments.length > 1 ?
				$.trim(arguments[1]).split(/\s+/) :
				["ready","play","pause","finish","buffering","timeupdate"];
			this.each(function () {
				var data = init(this);
				data.module.listen.call(this,data,events);
				for (var i = 0; i < events.length; ++ i) {
					data.listening[events[i]] = true;
				}
			});
			break;
			
		case "volume":
			if (arguments.length > 1) {
				var volume = Number(arguments[1]);
				this.each(function () {
					var data = init(this);
					data.module.setVolume.call(this,data,volume);
				});
			}
			else if (this.length === 0) {
				return NaN;
			}
			else {
				var data = init(this[0]);
				return data.module.volume.call(this[0],data);
			}
			break;

		case "duration":
		case "currenttime":
			if (this.length === 0) {
				return NaN;
			}
			else {
				var data = init(this[0]);
				return data.module[command].call(this[0],data);
			}
			break;
			
		case "link":
			if (this.length === 0) {
				return null;
			}
			else {
				var data = init(this[0]);
				return data.module.link.call(this[0],data);
			}
			break;

		default:
			throw new TypeError("unknown command: "+command);
		}

		return this;
	};

	$(window).on("message", function (event) {
		var raw = event.originalEvent;
		var module = $.embedplayer.modules_by_origin[raw.origin];
		if (module) {
			var message = module.parseMessage(raw);
			if (message) {
				$('[data-embedplayer-id="'+message.player_id+'"]').each(function () {
					var data = init(this);
					var element = this;
					var trigger = function (type,properties) {
						var state = null;
						switch (type) {
						case "timeupdate":
							break;

						case "ready":
							state = "ready";
							break;

						case "play":
							state = "playing";
							break;

						case "pause":
							state = "paused";
							break;

						case "finish":
							state = "finished";
							break;

						case "buffering":
							state = "buffering";
							break;
						}

						if (state && state === data.state) {
							return;
						}

						data.state = state;
						if (data.listening[type] === true) {
							var $element = $(element);
							if (state) $element.trigger($.Event('embedplayer:statechange',{state:sate}));
							$element.trigger($.Event('embedplayer:'+type,properties));
						}
					};
					data.module.processMessage.call(this,data,message,trigger);
				});
			}
		}
	});
})(jQuery);