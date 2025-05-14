// Generic Server Daemon
// Copyright (c) 2014 Joseph Huckaby
// Released under the MIT License

var Path = require('path');
var fs = require('fs');
var os = require('os');
var cp = require('child_process');
var async = require('async');

var Class  = require("pixl-class");
var Logger = require("pixl-logger");
var Config = require("pixl-config");
var Tools  = require("pixl-tools");
var Args   = require("pixl-args");

var mkdirp = Tools.mkdirp;

module.exports = Class.create({
	
	__name: "Generic Server",
	__version: "1.0",
	
	configFile: "",
	config: null,
	components: null,
	tickTimer: null,
	lastTickDate: null,
	
	configOverrides: null,
	coFile: '',
	coModTime: 0,
	coCheckTime: 0,
	
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
				
				// try to detect class name if not explicitly provided
				if (!comp.__name) comp.__name = compClass.name || Object.getPrototypeOf(comp).constructor.name || 'Generic';
				
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
			
			// try to detect class name if not explicitly provided
			if (!comp.__name) comp.__name = compClass.name || Object.getPrototypeOf(comp).constructor.name || 'Generic';
			
			this.components.push( comp );
			this[ comp.__name ] = comp;
		}
	},
	
	__init: function(callback) {
		// server initialization, private method (call startup() instead)
		var self = this;
		
		// allow CLI to override configFile
		var args = this.args = new Args();
		if (args.get('configFile')) this.configFile = args.get('configFile');
		else if (args.get('config')) this.configFile = args.get('config');
		
		// parse config file and cli args
		this.config = new Config( this.configFile || this.config || {}, true );
		if (this.multiConfig && !this.configFile) this.setupMultiConfig();
		this.applyConfigOverrides();
		
		this.debug = this.config.get('debug') || false;
		this.foreground = this.config.get('foreground') || false;
		this.echo = this.config.get('echo') || false;
		this.color = this.config.get('color') || false;
		this.logDebugErrors = this.config.get('log_debug_errors') || false;
		
		this.emit('init');
		
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
		
		// setup log agent
		this.logger = new Logger(
			Path.join( (this.config.get('log_dir') || '.'), (this.config.get('log_filename') || 'event.log') ),
			this.config.get('log_columns') || ['hires_epoch', 'date', 'hostname', 'pid', 'component', 'category', 'code', 'msg', 'data'],
			{ echo: this.echo, color: this.color, hostname: os.hostname() }
		);
		this.logger.set( 'debugLevel', this.config.get('debug_level') || 1 );
		if (!this.config.get('log_async')) this.logger.set('sync', true);
		
		if (this.echo && this.echoer) {
			// full custom echoer defined in server
			this.logger.set( 'echoer', function(line, cols, args) { self.echoer(line, cols, args); } );
		}
		else if (this.echo && (typeof(this.echo) == 'string') && !this.echo.match(/^\d+$/)) {
			// optional echo categories
			var re = new RegExp( '(' + this.echo.replace(/\s+/g, '|') + ')' );
			this.logger.set( 'echoer', function(line, cols, args) {
				if ( (''+args.component).match(re) || (''+args.category).match(re) ) {
					if (self.color) process.stdout.write( self.logger.colorize(cols) + "\n" );
					else process.stdout.write( line );
				}
			} );
		} // echo
		
		// optional log filter (conditional logging based on column matches)
		if (this.config.get('log_filters')) {
			var log_filters = this.config.get('log_filters');
			if (Tools.numKeys(log_filters)) this.logger.set( 'serializer', function(cols, args) {
				var result = true;
				for (var key in log_filters) {
					var values = log_filters[key];
					if (values['*']) {
						// allow 'everything EXCEPT certain col values
						if ((args[key] in values) && !values[args[key]]) { result = false; break; }
					}
					else {
						// standard filter logic, only log true matches
						if (!values[args[key]]) { result = false; break; }
					}
				}
				return result ? ('[' + cols.join('][') + ']' + os.EOL) : false;
			} );
		}
		
		if (this.debug || this.foreground || process.env.__daemon) {
			// avoid dupe log entries when forking daemon background process
			this.logDebug(2, this.__name + " v" + this.__version + " Starting Up", {
				pid: process.pid,
				ppid: process.ppid || 0,
				node: process.version,
				arch: process.arch,
				platform: process.platform,
				argv: process.argv,
				execArgv: process.execArgv
			});
		}
		
		// if echoing log, capture stdout errors in case user pipes us to something then hits ctrl-c
		if (this.echo) process.stdout.on('error', function() {});
		
		// init components
		this.initComponents();
		
		// allow components to hook post init and possibly interrupt startup
		if (!this.earlyStartComponents()) return;
		
		// become a daemon unless in debug mode
		if (!this.debug && !this.foreground) {
			// pass node cli args down to forked daemon process
			if (!process.env.__daemon) {
				var cli_args = process.execArgv;
				if (!cli_args.length) cli_args = this.config.get('gc_cli_args') || [];
				cli_args = cli_args.concat( this.config.get('inject_cli_args') || [] );
				
				cli_args.reverse().forEach( function(arg) {
					process.argv.splice( 1, 0, arg );
				} );
				
				this.logDebug(2, "Spawning background daemon process (PID " + process.pid + " will exit)", process.argv);
			}
			
			// respawn as daemon or continue if we are already one
			var daemon_opts = {
				cwd: process.cwd() // workaround for https://github.com/indexzero/daemon.node/issues/41
			};
			if (this.config.get('stdout')) {
				daemon_opts.stdout = fs.openSync(this.config.get('stdout'), 'a');
			}
			if (this.config.get('stderr')) {
				daemon_opts.stderr = fs.openSync(this.config.get('stderr'), 'a');
			}
			require('daemon')(daemon_opts);
		} // not in debug or foreground mode
		
		if (!this.debug) {
			// log crashes before exiting
			if (this.config.get('log_crashes')) {
				require('uncatch').on('uncaughtException', function(err) {
					fs.appendFileSync( Path.join(self.config.get('log_dir'), self.config.get('crash_filename') || 'crash.log'),
						(new Date()).toString() + " - " + os.hostname() + " - PID " + process.pid + "\n" + 
						err.stack + "\n\n"
					);
					self.logger.set('sync', true);
					self.logDebug(1, "Uncaught Exception: " + err, err.stack);
					// do not call exit here, as uncatch handles that
				});
			}
		} // not in debug mode
		
		// write pid file
		if (this.config.get('pid_file')) {
			var pid_file = this.config.get('pid_file');
			var pid = 0;
			try { pid = parseInt( fs.readFileSync( pid_file, 'utf8' ) ); } catch (e) {;}
			
			if (pid) {
				this.logDebug(1, "WARNING: An old PID File was found: " + pid_file + ": " + pid);
				
				var ping = false;
				try { ping = process.kill( pid, 0 ); }
				catch (e) {;}
				
				if (ping) {
					// make sure process is really ours
					var ps_raw = "";
					try { ps_raw = cp.execSync('ps -p ' + pid + ' -o args=', { timeout: 5000, encoding: 'utf8' }); }
					catch (e) {;}
					
					if (ps_raw.match(this.__name)) {
						var msg = "FATAL ERROR: Process " + pid + " from " + pid_file + " is still alive and running.  Aborting startup.";
						this.logger.set('sync', true);
						this.logDebug(1, msg);
						process.exit(1);
					}
					else {
						this.logDebug(2, "Old process " + pid + " is in use but is not ours, so the PID file will be replaced: " + pid_file);
					}
				}
				else {
					this.logDebug(2, "Old process " + pid + " is apparently dead, so the PID file will be replaced: " + pid_file);
				}
			}
			
			this.logDebug(9, "Writing PID File: " + pid_file + ": " + process.pid);
			
			try { fs.writeFileSync( pid_file, ''+process.pid ); }
			catch (e) {
				var msg = "FATAL ERROR: PID file could not be created: " + pid_file + ": " + e;
				this.logger.set('sync', true);
				this.logDebug(1, msg);
				process.exit(1);
			}
			
			// confirm PID file was actually written
			try {
				pid = fs.readFileSync( pid_file, 'utf8' );
				this.logDebug(10, "Confirmed PID File contents: " + pid_file + ": " + pid);
			}
			catch (e) {
				var msg = "FATAL ERROR: PID file could not be read: " + pid_file + ": " + e;
				this.logger.set('sync', true);
				this.logDebug(1, msg);
				process.exit(1);
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
	
	setupMultiConfig: function() {
		// allow multiple separate config files to automerge
		// multiConfig: [ {file, parser, key, freq}, ... ]
		var self = this;
		var given_args = false;
		
		// allow CLI to swap out one or more multi-config file paths
		if (self.args.multiConfig) {
			var files = Tools.alwaysArray( self.args.multiConfig );
			for (var idx = 0, len = files.length; idx < len; idx++) {
				this.multiConfig[idx].file = files[idx];
			}
		}
		
		this.multiConfig.forEach( function(multi) {
			var config = new Config(); // manual setup
			config.configFile = multi.file;
			
			if (multi.parser) config.parse = multi.parser;
			if (multi.freq) config.freq = multi.freq;
			
			// top-level master config gets CLI args
			// (if multiple files share top-level, only one gets the args)
			if (!multi.key && !given_args) {
				config.args = self.args;
				given_args = true;
			}
			
			config.load();
			config.monitor();
			
			// merge into top-level config
			if (multi.key) {
				// sub-config lives under specified key
				self.config.set( multi.key, config.get() );
			}
			else {
				// merge sub-config into base
				self.config.import( config.get() );
			}
			
			// listen for reloads
			config.on('reload', function() {
				self.logDebug(3, "Multi-config file reloaded: " + config.configFile, { key: multi.key });
				
				// re-merge all into base config
				self.remergeAllConfigs();
				
				// propagate reload event to server
				self.config.emit('reload');
				
				// and to components
				self.config.refreshSubs();
			}); // reload
			
			config.on('error', function(err) {
				self.logDebug(1, "Multi-config reload error: " + err);
			} );
			
			// save ref in server
			multi.config = config;
		}); // forEach
	},
	
	remergeAllConfigs: function() {
		// on multi-config reload we must re-merge all configs in natural order
		// (so the proper overrides prevail, no matter which file was reloaded)
		var self = this;
		
		this.multiConfig.forEach( function(multi) {
			var config = multi.config;
			
			// re-merge into base config
			if (multi.key) self.config.set( multi.key, config.get() );
			else self.config.import( config.get() );
		});
	},
	
	applyConfigOverrides: function() {
		// allow APPNAME_key env vars to override config
		var env_regex = new RegExp( "^" + this.__name.replace(/\W+/g, '_').toUpperCase() + "_(.+)$" );
		for (var key in process.env) {
			if (key.match(env_regex)) {
				var path = RegExp.$1.trim().replace(/^_+/, '').replace(/_+$/, '').replace(/__/g, '/');
				var value = process.env[key].toString();
				
				// massage value into various types
				if (value === 'true') value = true;
				else if (value === 'false') value = false;
				else if (value.match(/^\-?\d+$/)) value = parseInt(value);
				else if (value.match(/^\-?\d+\.\d+$/)) value = parseFloat(value);
				
				// Note: This code runs too early to log at startup, but it will log on config reload
				this.logDebug(9, "Applying env config override: " + key, value);
				this.config.setPath(path, value);
			}
		}
		
		// allow overrides via special file containing json paths (in dot or slash notation)
		if (this.config.get('config_overrides_file')) {
			this.coFile = this.config.get('config_overrides_file');
			this.coModTime = 0;
			this.coCheckTime = Tools.timeNow(true);
			this.configOverrides = null;
			try {
				var stats = fs.statSync( this.coFile );
				this.coModTime = stats.mtime.getTime();
			}
			catch(err) {
				// Note: This code runs too early to log at startup, but it will log on config reload
				this.logDebug(3, "Config overrides file not found, skipping: " + this.coFile);
			}
			if (this.coModTime) {
				// Note: This code runs too early to log at startup, but it will log on config reload
				this.logDebug(8, "Loading config overrides file: " + this.coFile);
				
				try {
					this.configOverrides = JSON.parse( fs.readFileSync( this.coFile, 'utf8' ) );
				}
				catch (err) {
					// checking for `this.logger` because on startup this code runs too early to log anything at all
					// throw on startup instead, so this is very loud indeed
					if (!this.logger) throw new Error("Config overrides file could not be loaded: " + this.coFile + ": " + (err.message || err));
					this.logError('config', "Config overrides file could not be loaded, skipping: " + this.coFile + ": " + (err.message || err));
					this.configOverrides = null;
				}
			}
		}
		
		// allow class to override config
		if (this.configOverrides) {
			for (var key in this.configOverrides) {
				var path = key.match(env_regex) ? RegExp.$1.trim().replace(/^_+/, '').replace(/_+$/, '').replace(/__/g, '/') : key;
				var value = this.configOverrides[key];
				// Note: This code runs too early to log at startup, but it will log on config reload
				this.logDebug(9, "Applying config override: " + key, value);
				this.config.setPath(path, value);
			}
		}
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
		
		// finish log setup
		this.logger.set({ hostname: this.hostname, ip: this.ip });
		
		// this may contain secrets, so only logging it at level 10
		this.logDebug(10, "Configuration", this.config.get());
		this.logDebug(2, "Server Info:", { hostname: this.hostname, ip: this.ip, daemon: !!process.env.__daemon });
		
		// listen for various shutdown signals
		this.sigIntFunc = function() { 
			self.logDebug(2, "Caught SIGINT");
			self.shutdown(); 
		};
		process.on('SIGINT', this.sigIntFunc );
		
		this.sigTermFunc = function() { 
			self.logDebug(2, "Caught SIGTERM");
			self.shutdown(); 
		};
		process.on('SIGTERM', this.sigTermFunc );
		
		this.sigHupFunc = function() { 
			self.logDebug(2, "Caught SIGHUP");
			self.shutdown(); 
		};
		process.on('SIGHUP', this.sigHupFunc );
		
		// monitor config changes
		this.config.on('reload', function() {
			self.applyConfigOverrides();
			self.logDebug(2, "Configuration was reloaded", self.debugLevel(9) ? self.config.get() : null);
		} );
		this.config.on('error', function(err) {
			self.logDebug(1, "Config reload error: " + err);
		} );
		
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
					self.logError('startup', "Component startup error: " + err);
					self.logDebug(1, "Component startup error: " + err);
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
	
	earlyStartComponents: function() {
		// allow components to perform early startup functions
		// return false to abort startup (allows component to take over before daemon fork)
		for (var idx = 0, len = this.components.length; idx < len; idx++) {
			var result = this.components[idx].earlyStart();
			if (result === false) return false;
		}
		return true;
	},
	
	run: function(callback) {
		// this is called at the very end of the startup process
		// all components are started
		var self = this;
		
		// optionally change uid if desired (only works if we are root)
		// TODO: The log file will already be created as root, and will fail after switching users
		if (!this.debug && this.config.get('uid') && (process.getuid() == 0)) {
			this.logDebug(4, "Switching to user: " + this.config.get('uid') );
			process.setuid( this.config.get('uid') );
		}
		
		// start tick timer for periodic tasks
		this.lastTickDate = Tools.getDateArgs( new Date() );
		
		var last_sec = Math.floor( Date.now() / 1000 );
		this.tickTimer = setInterval( function() {
			var now = Math.floor( Date.now() / 1000 );
			if (now != last_sec) {
				self.tick();
				last_sec = now;
			}
		}, this.config.get('tick_precision_ms') || 100 );
		
		// start server main loop
		this.logDebug(2, "Startup complete, entering main loop");
		this.emit('ready');
		this.started = Tools.timeNow(true);
		
		// fire callback if provided
		if (callback) callback();
	},
	
	tick: function() {
		// run every second, for periodic tasks
		var self = this;
		var dargs = Tools.getDateArgs( new Date() );
		if (this.shut) return;
		
		this.emit('tick');
		this.emit('*:' + dargs.ss, dargs);
		
		// also emit minute, hour and day events when they change
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
		
		// monitor config overrides file
		if (this.coModTime && (dargs.epoch - this.coCheckTime >= this.config.freq / 1000)) {
			this.coCheckTime = dargs.epoch;
			
			fs.stat( this.coFile, function(err, stats) {
				// ignore errors here due to possible race conditions
				var mod = (stats && stats.mtime) ? stats.mtime.getTime() : 0;
				
				if (mod && (mod != self.coModTime)) {
					// file has changed on disk, schedule a reload
					self.coModTime = mod;
					self.logDebug(3, "Config overrides file has changed on disk, scheduling reload: " + self.coFile);
					
					if (self.multiConfig) {
						// re-merge all into base config
						self.remergeAllConfigs();
						
						// propagate reload event to server
						self.config.emit('reload');
						
						// and to components
						self.config.refreshSubs();
					}
					else {
						self.config.mod = 0;
						self.config.check();
					}
				}
			}); // fs.stat
		}
	},
	
	shutdown: function(callback) {
		// shutdown all components
		var self = this;
		this.logger.set('sync', true);
		this.logDebug(2, "Shutting down");
		
		// delete pid file
		if (this.config.get('pid_file')) {
			try {
				var pid = fs.readFileSync( this.config.get('pid_file'), 'utf8' );
				this.logDebug(9, "Deleting PID File: " + this.config.get('pid_file') + ": " + pid);
				fs.unlinkSync( this.config.get('pid_file') );
			}
			catch (e) {;}
		}
		
		if (this.shut) {
			// if shutdown() is called twice, something is very wrong
			this.logDebug(1, "EMERGENCY: Shutting down immediately");
			process.exit(1);
		}
		this.shut = true;
		
		// stop tick timer
		if (this.tickTimer) {
			clearTimeout( this.tickTimer );
			delete this.tickTimer;
		}
		
		// stop config monitors
		this.config.stop();
		
		if (this.multiConfig) {
			this.multiConfig.forEach( function(multi) { 
				if (multi.config) multi.config.stop(); 
			} );
		}
		
		// if startup was interrupted, exit immediately
		if (!this.started) {
			this.logError(1, "Startup process was interrupted, exiting");
			this.emit('shutdown');
			process.exit(1);
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
					if (self.config.get('exit_on_shutdown')) process.exit(0);
					if (self.sigIntFunc) process.off('SIGINT', self.sigIntFunc);
					if (self.sigTermFunc) process.off('SIGTERM', self.sigTermFunc);
					if (self.sigHupFunc) process.off('SIGHUP', self.sigHupFunc);
				}
			}
		); // foreach component
	},
	
	debugLevel: function(level) {
		// check if we're logging at or above the requested level
		if (!this.logger) return false;
		return (this.logger.get('debugLevel') >= level);
	},
	
	logDebug: function(level, msg, data) {
		if (this.logger) {
			this.logger.set( 'component', this.__name );
			this.logger.debug(level, msg, data);
			
			// optionally log level 1 debug events as fatal errors
			if ((level == 1) && this.logDebugErrors) this.logger.error('fatal', msg, data);
		}
	},
	
	logError: function(code, msg, data) {
		if (this.logger) {
			this.logger.set( 'component', this.__name );
			this.logger.error(code, msg, data);
		}
	},
	
	logTransaction: function(code, msg, data) {
		if (this.logger) {
			this.logger.set( 'component', this.__name );
			this.logger.transaction(code, msg, data);
		}
	}
	
});
