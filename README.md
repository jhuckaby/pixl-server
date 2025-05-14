<details><summary>Table of Contents</summary>

<!-- toc -->
- [Overview](#overview)
- [Usage](#usage)
- [Components](#components)
	* [Stock Components](#stock-components)
		+ [WebServer (pixl-server-web)](#webserver-pixl-server-web)
		+ [PoolManager (pixl-server-pool)](#poolmanager-pixl-server-pool)
		+ [JSON API (pixl-server-api)](#json-api-pixl-server-api)
		+ [UserManager (pixl-server-user)](#usermanager-pixl-server-user)
		+ [Storage (pixl-server-storage)](#storage-pixl-server-storage)
		+ [MultiServer (pixl-server-multi)](#multiserver-pixl-server-multi)
- [Events](#events)
	* [init](#init)
	* [prestart](#prestart)
	* [ready](#ready)
	* [shutdown](#shutdown)
	* [Maintenance Events](#maintenance-events)
		+ [tick](#tick)
		+ [minute](#minute)
			- [:MM](#mm)
			- [HH:MM](#hhmm)
		+ [hour](#hour)
		+ [day](#day)
		+ [month](#month)
		+ [year](#year)
- [Configuration](#configuration)
	* [Command-Line Arguments](#command-line-arguments)
		+ [Optional Echo Categories](#optional-echo-categories)
	* [Multi-File Configuration](#multi-file-configuration)
	* [Config Overrides File](#config-overrides-file)
	* [Environment Variables](#environment-variables)
- [Logging](#logging)
	* [Log Filtering](#log-filtering)
- [Component Development](#component-development)
	* [Startup and Shutdown](#startup-and-shutdown)
	* [Accessing Your Configuration](#accessing-your-configuration)
	* [Accessing The Root Server](#accessing-the-root-server)
	* [Accessing Other Components](#accessing-other-components)
	* [Accessing The Server Log](#accessing-the-server-log)
- [Uncaught Exceptions](#uncaught-exceptions)
- [License](#license)

</details>

# Overview

This module is a generic server daemon framework, which supports a component plug-in system.  It can be used as a basis to create custom daemons such as web app backends.  It provides basic services such as configuration file loading, command-line argument parsing, logging, and more.  Component plug-ins can be created by you, or you can use some pre-made ones.

# Usage

Use [npm](https://www.npmjs.com/) to install the module:

```sh
npm install pixl-server
```

Then use `require()` to load it in your code:

```js
const PixlServer = require('pixl-server');
```

Then instantiate a server object and start it up:

```js
let server = new PixlServer({
	
	__name: 'MyServer',
	__version: "1.0",
	
	config: {
		"log_dir": "/let/log",
		"debug_level": 9,
		"uid": "www"
	},
	
	components: []
	
});
server.startup( function() {
	// startup complete
} );
```

Of course, this example won't actually do anything useful, because the server has no components.  Let's add a web server component to our server, just to show how it works:

```js
let PixlServer = require('pixl-server');

let server = new PixlServer({
	
	__name: 'MyServer',
	__version: "1.0",
	
	config: {
		"log_dir": "/let/log",
		"debug_level": 9,
		"uid": "www",
		
		"WebServer": {
			"http_port": 80,
			"http_htdocs_dir": "/let/www/html"
		}
	},
	
	components: [
		require('pixl-server-web')
	]
	
});
server.startup( function() {
	// startup complete
} );
```

This example uses the [pixl-server-web](https://www.github.com/jhuckaby/pixl-server-web) component to turn our server into a web (HTTP) server.  It will listen on port 80 and serve static files in the `/let/www/html` folder.

As you can see we're loading the `pixl-server-web` module by calling `require()` into the `components` array when creating our server object:

```js
components: [
	require('pixl-server-web')
]
```

To include additional components, simply add them to this array.  Please note that the order matters here.  Components that rely on WebServer, for example, should be listed after it.

Also, notice in the above example we added a new section to our existing `config` object, and named it `WebServer` (must match the component exactly).  In there we're setting a couple of new keys, which are specifically for that component:

```js
"WebServer": {
	"http_port": 80,
	"http_htdocs_dir": "/let/www/html"
}
```

Each component has its own section in the configuration file (or hash).  For more details on the WebServer configuration, see the [module documentation](https://www.github.com/jhuckaby/pixl-server-web).

# Components

Components make up the actual server functionality, and can be things like a web (HTTP) server, a SocketIO server, a back-end storage system, or a multi-server cluster manager.  A server may load multiple components (and some rely on each other).

A component typically starts some sort of listener (network socket listener, etc.) or simply exposes an API for other components or your code to use directly.

## Stock Components

As of this writing, the following stock server components are available via [npm](https://www.npmjs.com/):

### WebServer (pixl-server-web)

The WebServer ([pixl-server-web](https://www.github.com/jhuckaby/pixl-server-web)) component implements a full web (HTTP) server.  It supports HTTP and/or HTTPS, static file hosting, custom headers, as well as a hook system for routing specific URIs to your own handlers.

For more details, check it out on npm: [pixl-server-web](https://www.github.com/jhuckaby/pixl-server-web)

### PoolManager (pixl-server-pool)

The PoolManager ([pixl-server-pool](https://www.github.com/jhuckaby/pixl-server-pool)) component can delegate web requests to a pool of worker child processes.  This can be useful for CPU-hard operations such as image transformations, which would otherwise block the main thread.

For more details, check it out on npm: [pixl-server-pool](https://www.github.com/jhuckaby/pixl-server-pool)

### JSON API (pixl-server-api)

The API ([pixl-server-api](https://www.github.com/jhuckaby/pixl-server-api)) component provides a JSON REST API for your application.  It sits on top of (and relies on) the WebServer ([pixl-server-web](https://www.github.com/jhuckaby/pixl-server-web)) component.

For more details, check it out on npm: [pixl-server-api](https://www.github.com/jhuckaby/pixl-server-api)

### UserManager (pixl-server-user)

The UserManager ([pixl-server-user](https://www.github.com/jhuckaby/pixl-server-user)) component provides a full user login and user / session management system for your application.  Users can create accounts, login, update information, and logout.  It relies on the API ([pixl-server-api](https://www.github.com/jhuckaby/pixl-server-api)) component, as well as the Storage ([pixl-server-storage](https://www.github.com/jhuckaby/pixl-server-storage)) component.

For more details, check it out on npm: [pixl-server-user](https://www.github.com/jhuckaby/pixl-server-user)

### Storage (pixl-server-storage)

The Storage ([pixl-server-storage](https://www.github.com/jhuckaby/pixl-server-storage)) component provides an internal API for other components to store data on disk (or to the cloud).  It supports local disk storage, as well as Amazon S3.  One of its unique features is a high performance, double-ended linked list, built on top of a key/value store.  This is useful for web apps to store infinitely-sized lists of data.

For more details, check it out on npm: [pixl-server-storage](https://www.github.com/jhuckaby/pixl-server-storage)

### MultiServer (pixl-server-multi)

The MultiServer ([pixl-server-multi](https://www.github.com/jhuckaby/pixl-server-multi)) component automatically manages a cluster of servers on the same network.  They auto-detect each other using UDP broadcast packets.  One server is flagged as the "master" node at all times, while the rest are "slaves".  If the master server goes down, one of the slaves will automatically take over.  An API is provided to get the list of server hostnames in the cluster, and it also emits events so your code can react to becoming master, etc.

For more details, check it out on npm: [pixl-server-multi](https://www.github.com/jhuckaby/pixl-server-multi)

# Events

The following events are emitted by the server.

## init

The `init` event is fired **very early** during initialization.  Only the server configuration is available at this stage.

## prestart

The `prestart` event is fired during server initialization.  The server's configuration and logging systems are available, and components are initialized but not started.  Your callback is not passed any arguments.

## ready

The `ready` event is fired when the server and all components have completed startup.  Your callback is not passed any arguments.

## shutdown

The `shutdown` event is fired when the server and all components have shutdown, and Node is about to exit.  Your callback is not passed any arguments.

## Maintenance Events

These events are emitted periodically, and can be used to schedule time-based events such as hourly log rotation, daily storage cleanup, etc.  Unless otherwise noted, your callback will be passed an object representing the current local date and time, as returned from [getDateArgs()](https://www.github.com/jhuckaby/pixl-tools#getdateargs).

### tick

This event is fired approximately once every second, but is not guaranteed to be fired *on* the second (but we try to be as close as possible).  This is more for things like general heartbeat tasks (check for status of running jobs, etc.).  Your callback is not passed any arguments.

As a convenience, an `*:SS` event is also emitted every tick, where `SS` is the current 2-digit second number, with zero-padding below 10, e.g. `*:00`, `*:01`, `*:02`, etc.

### minute

This event is fired every minute, on the minute.  Example:

```js
server.on('minute', function(args) {
	// Do something every minute
});
```

#### :MM

Also fired every minute, this event name will contain the actual minute number (two-digit padded from `00` to `59`), so you can schedule hourly jobs that run at a particular minute.  Don't forget the colon (:) prefix.  Example:

```js
server.on(':15', function(args) {
	// This will run on the :15 of the hour, every hour
});
```

#### HH:MM

Also fired every minute, this event name will contain both the hour digits (from `00` to `23`) and the minute (from `00` to `59`), so you can schedule daily jobs that run at a particular time.  Example:

```js
server.on('04:30', function(args) {
	// This will run once at 4:30 AM, every day
});
```

### hour

This event is fired every hour, on the hour.  Example:

```js
server.on('hour', function(args) {
	// Do something every hour
});
```

### day

This event is fired every day at midnight.  Example:

```js
server.on('day', function(args) {
	// Do something every day at midnight
});
```

### month

This event is fired at midnight when the month changes.  Example:

```js
server.on('month', function(args) {
	// Do something every month
});
```

### year

This event is fired at midnight when the year changes.  Example:

```js
server.on('year', function(args) {
	// Do something every year
});
```

# Configuration

The server configuration consists of a set of global, top-level keys, and then each component has its own sub-section keyed by its name.  The configuration can be specified as an inline JSON object to the constructor in the `config` property like this:

```json
{
	"config": {
		"log_dir": "/let/log",
		"debug_level": 9,
		"uid": "www"
	}
}
```

Or it can be saved in JSON file, and specified using the `configFile` property like this:

```json
{
	"configFile": "conf/config.json"
}
```

Here are the global configuration keys:

| Config Key | Default Value | Description |
|------------|---------------|-------------|
| `debug` | `false` | When set to `true`, will run directly on the console without forking a daemon process. |
| `echo` | `false` | When set to `true` and combined with `debug`, will echo all log output to the console. |
| `color` | `false` | When set to `true` and combined with `echo`, all log columns will be colored in the console. |
| `log_dir` | "." | Directory path where event log will be stored. |
| `log_filename` | "event.log" | Event log filename, joined with `log_dir`. |
| `log_columns` | [Array] | Custom event log columns, if desired (see [Logging](#logging) below). |
| `log_crashes` | `false` | When set to `true`, will log all uncaught exceptions to a `crash.log` file in the `log_dir` dir. |
| `log_async` | `false` | When set to `true`, all log entries will be written in async mode (i.e. in the background). |
| `uid` | `null` | If set and running as root, forked daemon process will attempt to switch to the specified user (numerical ID or a username string). |
| `pid_file` | - | Optionally set a PID file, that is created on startup and deleted on shutdown. |
| `debug_level` | `1` | Debug logging level, larger numbers are more verbose, 1 is quietest, 10 is loudest. |
| `inject_cli_args` | - | Optionally inject Node.js command-line arguments into forked daemon process, e.g. `["--max_old_space_size=4096"]`. |
| `log_debug_errors` | `false` | Optionally log all debug level 1 events as errors with `fatal` code.  Helps for visibility with log alerting systems. |
| `stdout` | - | When forking a daemon process, this will redirect the forked process STDOUT stream to the specified file (will be created if necessary). |
| `stderr` | - | When forking a daemon process, this will redirect the forked process STDERR stream to the specified file (will be created if necessary). |
| `config_overrides_file` | - | Optionally specify a file containing configuration overrides.  See [Config Overrides File](#config-overrides-file) below. |

Remember that each component should have its own configuration key.  Here is an example server configuration, including the `WebServer` component:

```json
{
	"config": {
		"log_dir": "/let/log",
		"debug_level": 9,
		"uid": "www",
		
		"WebServer": {
			"http_port": 80,
			"http_htdocs_dir": "/let/www/html"
		}
	}
}
```

Consult the documentation for each component you use to see which keys they require.

## Command-Line Arguments

You can specify command-line arguments when launching your server.  If these are in the form of `--key value` they will override any global configuration keys with matching names.  For example, you can launch your server in debug mode and enable log echo like this:

```sh
node my-script.js --debug 1 --echo 1
```

Actually, you can set a configuration key to boolean `true` simply by including it without a value, so this works too:

```sh
node my-script.js --debug --echo
```

You can set deep configuration properties nested inside objects by using `dot.path.notation`.  Example:

```sh
node my-script.js --WebServer.http_bind_address localhost
```

### Optional Echo Categories

If you want to limit the log echo to certain log categories or components, you can specify them on the command-line, like this:

```sh
node my-script.js --debug 1 --echo "Debug Error"
```

This would limit the log echo to entries that had their `category` or `component` column set to either `Debug` or `Error`.  Other non-matched entries would still be logged -- they just wouldn't be echoed to the console.

## Multi-File Configuration

If your app has multiple configuration files, you can specify a `multiConfig` property (instead of `configFile`) in your pixl-server class.  The `multiConfig` property should be an array of objects, with each object representing one configuration file.  The properties in the objects should be as follows:

| Property Name | Description |
|---------------|-------------|
| `file` | **(Required)** Filesystem path to the configuration file. |
| `key` | Optional key for configuration to live under (omit to merge file into top-level config). |
| `parser` | Optional function for parsing custom file format (defaults to `JSON.parse`). |
| `freq` | Optional frequency for polling file for changes (in milliseconds, defaults to `10000`). |

So for example, let's say you had one main configuration file which you want loaded and parsed as usual, but you also have an environment-specific config file, and want it included as well, but separated into its own namespace.  Here is how you could accomplish this with `multiConfig`:

```js
"multiConfig": [
	{
		"file": "/opt/myapp/conf/config.json"
	},
	{
		"file": "/etc/env.json",
		"key": "env"
	}
]
```

So in the above example the `config.json` file would be loaded and parsed as if it were the main configuration file (since it has no `key` property), and its contents merged into the top-level server configuration.  Then the `/etc/env.json` file would also be parsed, and its contents made available in the `env` configuration key.  So you could access it via:

```js
let env = server.config.get('env');
```

Both files would be monitored for changes (polled every 10 seconds by default) and hot-reloaded as necessary.  If any file is reloaded, a `reload` event is emitted on the main `server.config` object, so you can listen for this and perform any app-specific operations as needed.

For another example, let's say your environment-specific file is actually in [XML](https://en.wikipedia.org/wiki/XML) format.  For this, you need to specify a custom parser function via the `parser` property.  If you use our own [pixl-xml](https://www.github.com/jhuckaby/pixl-xml) module, the usage is as follows:

```js
"multiConfig": [
	{
		"file": "/opt/myapp/conf/config.json"
	},
	{
		"file": "/etc/env.xml",
		"key": "env",
		"parser": require('pixl-xml').parse
	}
]
```

Your `parser` function is passed a single argument, which is the file contents preloaded as UTF-8 text, and it is expected to return an object containing the parsed data.  If you need to parse your own custom file format, you can call your own inline function like this:

```js
"multiConfig": [
	{
		"file": "/opt/myapp/conf/config.json"
	},
	{
		"file": "/etc/env.ini",
		"key": "env",
		"parser": function(text) {
			// parse simple INI `key=value` format
			let config = {};
			text.split(/\n/).forEach( function(line) {
				if (line.trim().match(/^(\w+)\=(.+)/)) { 
					config[ RegExp.$1 ] = RegExp.$2; 
				}
			} );
			return config;
		}
	}
]
```

If your custom parser function throws during the initial load at startup, the error will bubble up and cause an immediate shutdown.  However, if it throws during a hot reload event, the error is caught, logged as a level 1 debug event, and the old configuration is used until the file is modified again.  This way a malformed config file edit won't bring down a live server.

It is perfectly fine to have multiple configuration files that "share" the top-level main configuration namespace.  Just specify multiple files without `key` properties.  Example:

```js
"multiConfig": [
	{
		"file": "/opt/myapp/conf/config-part-1.json"
	},
	{
		"file": "/opt/myapp/conf/config-part-2.json"
	}
]
```

Beware of key collision here inside your files: no error is thrown, and the latter prevails.

You can also combine an inline `config` object, and the `multiConfig` object, in your server properties.  The files in the `multiConfig` array take precedence, and can override any keys present in the inline config.  Example:

```js
{
	"config": {
		"log_dir": "/let/log",
		"log_filename": "myapp.log",
		"debug_level": 9
	},
	"multiConfig": [
		{
			"file": "/opt/myapp/conf/config.json"
		},
		{
			"file": "/etc/env.json",
			"key": "env"
		}
	]
}
```

If you need to temporarily swap out your `multiConfig` file paths for testing, you can do so on the command-line.  Simply specify one or more `--multiConfig` CLI arguments, each one pointing to a replacement file.  The files must be specified in order of the items in your `multiConfig` array.  Example:

```sh
node myserver.js --multiConfig test/config.json --multiConfig test/env.json
```

**Note:** The `configFile` and `multiConfig` server properties are mutually exclusive.  If you specify `configFile`  it takes precedence, and disables the multi-config system.

## Config Overrides File

If you specify the `config_overrides_file` configuration property, and point it at a JSON file on disk, it is applied as a set of "overrides" using `dot.path.notation`.  For example:

```json
{
	"config_overrides_file": "/etc/my-overrides.json"
}
```

If the `/etc/my-overrides.json` file contained the following:

```json
{
	"debug_level": "5",
	"Storage.engine": "S3",
	"WebServer.http_log_requests": false
}
```

Then those overrides would be applied to the configuration.  Note how you can set nested properties too.  This kind of thing is very useful for an environment-specific config override system.

## Environment Variables

You can set special environment variables that work as configuration overrides.  You can even target nested configuration properties this way.  The format is as follows:

```
APPNAME_CONFIGPATH
```

The `APPNAME` is whatever you set in the `__name` property in your pixl-server instance.  It should be all upper-case in the environment variable name.  The `CONFIGPATH` is a "path" to the configuration property to override.  If the property is a top-level, just specify it directly (case-sensitive).  If nested, use **double-underscore** (`__`) to traverse into sub-objects (instead of a period, which isn't allowed in environment variables).  Examples:

```
MYSERVER_debug_level=5
MYSERVER_Storage__engine="S3"
MYSERVER_WebServer__http_log_requests=false
```

Environment variables are all naturally strings, but pixl-server will "auto-detect" other data types (floats, integers, and booleans) and convert as necessary.

# Logging

The server keeps an event log using the [pixl-logger](https://www.github.com/jhuckaby/pixl-logger) module.  This is a combination of a debug log, error log and transaction log, with a `category` column denoting the type of log entry.  By default, the log columns are defined as:

```js
['hires_epoch', 'date', 'hostname', 'component', 'category', 'code', 'msg', 'data']
```

However, you can override these and provide your own array of log columns by specifying a `log_columns` configuration key.

Here is an example debug log snippet:

```
[1432581882.204][2015-05-25 12:24:42][joeretina-2.local][][debug][1][MyServer v1.0 Starting Up][]
[1432581882.207][2015-05-25 12:24:42][joeretina-2.local][][debug][2][Configuration][{"log_dir":"/Users/jhuckaby/temp","debug_level":9,"WebServer":{"http_port":3012,"http_htdocs_dir":"/Users/jhuckaby/temp"},"debug":true,"echo":true}]
[1432581882.208][2015-05-25 12:24:42][joeretina-2.local][][debug][2][Server IP: 10.1.10.17, Daemon PID: 26801][]
[1432581882.208][2015-05-25 12:24:42][joeretina-2.local][][debug][3][Starting component: WebServer][]
[1432581882.209][2015-05-25 12:24:42][joeretina-2.local][WebServer][debug][2][Starting HTTP server on port: 3012][]
[1432581882.218][2015-05-25 12:24:42][joeretina-2.local][][debug][2][Startup complete, entering main loop][]
```

For debug log entries, the `category` column is set to `debug`, and the `code` columns is used as the debug level.  The server object (and your component object) has methods for logging debug messages, errors and transactions:

```js
server.logDebug( 9, "This would be logged at level 9 or higher." );
server.logError( 1005, "Error message for code 1005 here." );
server.logTransaction( 99.99, "Description of transaction here." );
```

These three methods all accept two required arguments, and an optional 3rd "data" object, which is serialized and logged into its own column if provided.  For the debug log, the first argument is the debug level.  Otherwise, it is considered a "code" (can be used however your app wants).

When you call `logDebug()`, `logError()` or `logTransaction()` on your component object, the `component` column will be set to the component name.  Otherwise, it will be blank (including when the server logs its own debug messages).

If you need low-level, direct access to the [pixl-logger](https://www.github.com/jhuckaby/pixl-logger) object, you can call it by accessing the `logger` property of the server object or your component class.  Example:

```js
server.logger.print({ 
	category: 'custom', 
	code: 'custom code', 
	msg: "Custom message here", 
	data: { text: "Will be serialized to JSON" } 
});
```

The server and component classes have a utility method named `debugLevel()`, which accepts a log level integer, and will return `true` if the current debug log level is high enough to emit something at the specified level, or `false` if it would be silenced.

## Log Filtering

You can specify criteria for which column values are logged in your app's configuration, using a top-level property called `log_filters`.  Here is how it works:

```json
"log_filters": {
	"category": {
		"error": true
	}
}
```

In the above example the app would *only* log errors, and nothing else (no debug, no transaction, etc.).  It essentially specifies which values of the `category` column are allowed to be logged.  Any column key can be specified here, and you may include multiple column rulesets.  But if any of them don't match, the entire line will not be logged.

You can alternately specify a wildcard key (`*`) in a ruleset and set it to `true`, which means log *any* value, but then you can *disable* specific column values.  Here is an example:

```json
"log_filters": {
	"component": {
		"*": true,
		"Storage": false,
		"WebServer": false
	}
}
```

This would log everything from all components (`*`), *except* the `Storage` or `WebServer` components.

# Component Development

To develop your own component, create a class that inherits from the `pixl-server/component` base class.  Your class name will be your Component ID.  This is how other components can reference yours from the `server` object, and this is the key used for your component's configuration as well.

Here is a simple component example:

```js
const Component = require("pixl-server/component");

module.exports = class MyComponent extends Component {
	
	startup(callback) {
		this.logDebug(1, "My component is starting up!");
		callback();
	}
	
	shutdown(callback) {
		this.logDebug(1, "My component is shutting down!");
		callback();
	}
	
};
```

Now, assuming you saved this class as `my_component.js`, you would load it in a server by adding it to the `components` array like this:

```js
components: [
	require('pixl-server-web'),
	require('./my_component.js')
]
```

This would load the [pixl-server-web](https://www.github.com/jhuckaby/pixl-server-web) component first, followed by your `my_component.js` component after it.  Remember that the load order is important, if you have a component that relies on another.

Your component's configuration would be keyed off the class name, like this:

```js
{
	config: {
		"log_dir": "/let/log",
		"debug_level": 9,
		"uid": "www",
		
		"WebServer": {
			"http_port": 80,
			"http_htdocs_dir": "/let/www/html"
		},
		
		"MyComponent": {
			"key1": "Value 1",
			"key2": "Value 2"
		}
	}
}
```

If you want to specify default configuration keys (in case they are missing from the server configuration for your component), you can define a `defaultConfig` property in your class, like this:

```js
module.exports = class MyComponent extends Component {
	
	defaultConfig = {
		"key1": "Default Value 1",
		"key2": "Default Value 2"
	}
	
	...
};
```

## Startup and Shutdown

Your component should at least provide `startup()` and `shutdown()` methods.  These are both async methods, which should invoke the provided callback function when they are complete.  Example:

```js
{
	startup(callback) {
		this.logDebug(1, "My component is starting up!");
		callback();
	}
	
	shutdown(callback) {
		this.logDebug(1, "My component is shutting down!");
		callback();
	}
}
```

As with all Node.js callbacks, if something goes wrong and you want to abort the startup or shutdown routines, pass an `Error` object to the callback method.

## Accessing Your Configuration

Your configuration object is always accessible via `this.config`.  Note that this is an instance of [pixl-config](https://www.github.com/jhuckaby/pixl-config), so you need to call `get()` on it to fetch individual configuration keys, or you can fetch the entire object by calling it without an argument:

```js
{
	startup(callback) {
		this.logDebug(1, "My component is starting up!");
		
		// access our component configuration
		let key1 = this.config.get('key1');
		let entire_config = this.config.get();
		
		callback();
	}
}
```

If the server configuration is live-reloaded due to a changed file, your component's `config` object will emit a `reload` event, which you can listen for.

## Accessing The Root Server

Your component can always access the root server object via `this.server`.  Example:

```js
{
	startup(callback) {
		this.logDebug(1, "My component is starting up!");
		
		// access the main server configuration
		let server_uid = this.server.config.get('uid');
		
		callback();
	}
}
```

## Accessing Other Components

Other components are accessible via `this.server.COMPONENT_NAME`.  Please be aware of the component load order, as components listed below yours in the server `components` array won't be fully loaded when your `startup()` method is called.  Example:

```js
{
	startup(callback) {
		this.logDebug(1, "My component is starting up!");
		
		// access the WebServer component
		this.server.WebServer.addURIHandler( '/my/custom/uri', 'Custom Name', function(args, callback) {
			// custom request handler for our URI
			callback( 
				"200 OK", 
				{ 'Content-Type': "text/html" }, 
				"Hello this is custom content!\n" 
			);
		} );
		
		callback();
	}
}
```

## Accessing The Server Log

Your component's base class has convenience methods for logging debug messages, errors and transactions via the `logDebug()`, `logError()` and `logTransaction()` methods, respectively.  These log messages will all be tagged with your component name, to differentiate them from other components and generic server messages.  Example:

```js
this.logDebug( 9, "This would be logged at level 9 or higher." );
this.logError( 1005, "Error message for code 1005 here." );
this.logTransaction( 99.99, "Description of transaction here." );
```

If you need low-level, direct access to the [pixl-logger](https://www.github.com/jhuckaby/pixl-logger) object, you can call it by accessing the `logger` property of your component class.  Example:

```js
this.logger.print({ 
	category: 'custom', 
	code: 'custom code', 
	msg: "Custom message here", 
	data: { text: "Will be serialized to JSON" } 
});
```

# Uncaught Exceptions

When the `log_crashes` feature is enabled, the [uncatch](https://www.github.com/jhuckaby/uncatch) module is used to manage uncaught exceptions.  The server registers a listener to log crashes, but you can also add your own listener to perform emergency shutdown procedures in the event of a crash (uncaught exception).

The idea with [uncatch](https://www.github.com/jhuckaby/uncatch) is that multiple modules can all register listeners, and that includes your application code.  Example:

```js
require('uncatch').on('uncaughtException', function(err) {
	// run your own sync shutdown code here
	// do not call process.exit
});
```

On an uncaught exception, this code would run *in addition to* the server logging the exception to the crash log.  Uncatch then emits the error and stack trace to STDERR and calls `process.exit(1)` after all listeners have executed.

# License

**The MIT License (MIT)**

*Copyright (c) 2015 - 2019 by Joseph Huckaby.*

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
