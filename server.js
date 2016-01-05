// Generic Server Daemon
// Copyright (c) 2014 Joseph Huckaby
// Released under the MIT License

var path = require('path');
var fs = require('fs');
var async = require('async');
var mkdirp = require('mkdirp');

var Class  = require("pixl-class");
var Logger = require("pixl-logger");
var Config = require("pixl-config");
var Tools  = require("pixl-tools");

module.exports = Class.create({
	
	__name: "Generic Server",
	__version: "1.0",
	
	configFile: "",
	config: null,
	components: null,
	tickTimer: null,
	lastTickDate: null,
	
	__construct: function(overrides) {
		// class constructor
		if (overrides) {
			for (var key in overrides) {
				this[key] = overrides[key];
			}
		}
		if (this.components) {
			// components specified in constructor
			for (var idx = 0, len = this.components.length; idx < len; idx++) {
				var compClass = this.components[idx];
				var comp = new compClass();
				this.components[idx] = comp;
				this[ comp.__name ] = comp;
			}
		}
		else {
			// will add() components later
			this.components = [];
		}
	},
	
	add: function() {
		// register one or more server components
		for (var idx = 0, len = arguments.length; idx < len; idx++) {
			var compClass = arguments[idx];
			var comp = new compClass();
			this.components.push( comp );
			this[ comp.__name ] = comp;
		}
	},
	
	__init: function(callback) {
		// server initialization, private method (call startup() instead)
		var self = this;
		
		// parse config file and cli args
		this.config = new Config( this.configFile || this.config, false );
		
		// allow class to override config
		if (this.configOverrides) {
			for (var key in this.configOverrides) {
				this.config.set(key, this.configOverrides[key]);
			}
		}
		
		this.debug = this.config.get('debug') || false;
		this.echo = this.config.get('echo') || false;
		this.color = this.config.get('color') || false;
		
		// create base log dir
		if (this.config.get('log_dir')) {
			try {
				mkdirp.sync( this.config.get('log_dir') );
			}
			catch (e) {
				var msg = "FATAL ERROR: Log directory could not be created: " + this.config.get('log_dir') + ": " + e;
				throw new Error(msg);
			}
		} // log_dir
		
		// become a daemon unless in debug mode
		if (!this.debug) {
			require('daemon')();
			
			// log crashes before exiting
			process.on('uncaughtException', function(err) {
				fs.appendFileSync( path.join(self.config.get('log_dir'), 'crash.log'),
					(new Date()).toString() + "\n" + 
					// 'Uncaught exception: ' + err + "\n\n" + 
					err.stack + "\n\n"
				);
				process.exit(1);
			});
		} // not in debug mode
		
		// write pid file
		if (this.config.get('pid_file')) {
			try { fs.writeFileSync( this.config.get('pid_file'), process.pid ); }
			catch (e) {
				var msg = "FATAL ERROR: PID file could not be created: " + this.config.get('pid_file') + ": " + e;
				throw new Error(msg);
			}
		}
		
		// determine server hostname and ip, create dirs
		this.config.getEnv( function(err) {
			if (err) throw(err);
			
			self.hostname = self.config.hostname;
			self.ip = self.config.ip;
			
			callback();
		} );
	},
	
	startup: function(callback) {
		// setup server and fire callback
		var self = this;
		
		this.__init( function() {
			self.startupFinish(callback);
		} );
	},
	
	startupFinish: function(callback) {
		// finish startup sequence
		var self = this;
		
		this.logger = new Logger(
			path.join( (this.config.get('log_dir') || '.'), (this.config.get('log_filename') || 'event.log') ),
			this.config.get('log_columns') || ['hires_epoch', 'date', 'hostname', 'component', 'category', 'code', 'msg', 'data'],
			{ hostname: this.hostname, ip: this.ip, echo: this.echo, color: this.color }
		);
		this.logger.set( 'debugLevel', this.config.get('debug_level') || 1 );
		
		this.logDebug(1, this.__name + " v" + this.__version + " Starting Up");
		
		// this may contain secrets, so only logging it at level 10
		this.logDebug(10, "Configuration", this.config.get());
		
		this.logDebug(2, "Server IP: " + this.ip + ", Daemon PID: " + process.pid);
		
		// listen for shutdown events
		process.on('SIGINT', function() { 
			self.logDebug(1, "Caught SIGINT");
			self.shutdown(); 
		} );
		process.on('SIGTERM', function() { 
			self.logDebug(1, "Caught SIGTERM");
			self.shutdown(); 
		} );
		
		// monitor config changes
		this.config.on('reload', function() {
			self.logDebug(2, "Configuration was reloaded", self.config.get());
			self.initComponents();
		} );
		this.config.on('error', function(err) {
			self.logDebug(2, "Config reload error:" + err);
		} );
		
		// init components
		this.initComponents();
		
		// notify listeners we are starting components
		this.emit('prestart');
		
		// load components (async)
		async.eachSeries( this.components, 
			function(comp, callback) {
				// start component
				self.logDebug(3, "Starting component: " + comp.__name);
				comp.startup( callback );
			},
			function(err) {
				// all components started
				if (err) {
					self.logError(1, "Component startup error: " + err);
					self.shutdown();
				}
				else self.run(callback);
			}
		); // foreach component
	},
	
	initComponents: function() {
		// initialize all components (on startup and config reload)
		for (var idx = 0, len = this.components.length; idx < len; idx++) {
			this.components[idx].init( this );
		}
	},
	
	run: function(callback) {
		// this is called at the very end of the startup process
		// all components are started
		
		// optionally change uid if desired (only works if we are root)
		// TODO: The log file will already be created as root, and will fail after switching users
		if (!this.debug && this.config.get('uid') && (process.getuid() == 0)) {
			this.logDebug(4, "Switching to user: " + this.config.get('uid') );
			process.setuid( this.config.get('uid') );
		}
		
		// start tick timer for periodic tasks
		this.lastTickDate = Tools.getDateArgs( new Date() );
		this.tickTimer = setInterval( this.tick.bind(this), 1000 );
		
		// start server main loop
		this.logDebug(2, "Startup complete, entering main loop");
		this.emit('ready');
		this.started = Tools.timeNow(true);
		
		// fire callback if provided
		if (callback) callback();
	},
	
	tick: function() {
		// run every second, for periodic tasks
		this.emit('tick');
		
		// also emit minute, hour and day events when they change
		var dargs = Tools.getDateArgs( new Date() );
		if (dargs.min != this.lastTickDate.min) {
			this.emit('minute', dargs);
			this.emit( dargs.hh + ':' + dargs.mi, dargs );
			this.emit( ':' + dargs.mi, dargs );
		}
		if (dargs.hour != this.lastTickDate.hour) this.emit('hour', dargs);
		if (dargs.mday != this.lastTickDate.mday) this.emit('day', dargs);
		if (dargs.mon != this.lastTickDate.mon) this.emit('month', dargs);
		if (dargs.year != this.lastTickDate.year) this.emit('year', dargs);
		this.lastTickDate = dargs;
	},
	
	shutdown: function(callback) {
		// shutdown all components
		var self = this;
		
		// delete pid file
		if (this.config.get('pid_file')) {
			try { fs.unlinkSync( this.config.get('pid_file') ); }
			catch (e) {;}
		}
		
		if (this.shut) {
			// if shutdown() is called twice, something is very wrong
			this.logDebug(1, "EMERGENCY: Shutting down immediately");
			process.exit(1);
		}
		this.shut = true;
		this.logDebug(1, "Shutting down");
		
		// stop tick timer
		if (this.tickTimer) {
			clearTimeout( this.tickTimer );
			delete this.tickTimer;
		}
		
		// stop components
		async.eachSeries( this.components.reverse(), 
			function(comp, callback) {
				// stop component
				self.logDebug(3, "Stopping component: " + comp.__name);
				comp.shutdown( callback );
			},
			function(err) {
				// all components stopped
				self.components = [];
				if (err) {
					self.logError(1, "Component shutdown error: " + err);
					process.exit(1);
				}
				else {
					self.logDebug(2, "Shutdown complete, exiting");
					self.emit('shutdown');
					if (callback) callback();
				}
			}
		); // foreach component
	},
	
	debugLevel: function(level) {
		// check if we're logging at or above the requested level
		return (this.logger.get('debugLevel') >= level);
	},
	
	logDebug: function(level, msg, data) { 
		this.logger.set( 'component', this.__name );
		this.logger.debug(level, msg, data); 
	},
	
	logError: function(code, msg, data) { 
		this.logger.set( 'component', this.__name );
		this.logger.error(code, msg, data); 
	},
	
	logTransaction: function(code, msg, data) { 
		this.logger.set( 'component', this.__name );
		this.logger.transaction(code, msg, data); 
	}
	
});
