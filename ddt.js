/**
 * Devious Debugging Tool, v0.3.0
 * Copyright (c) 2013-2014, deviantART, Inc.
 * Licensed under 3-Clause BSD.
 * Refer to the LICENCES.txt file for details.
 * For latest version, see https://github.com/deviantART/ddt
 *
 * Modified 2015-07-21 by When I Work, Inc:
 *
 * - added "days" configuration
 * - removed image "server" cookie setting
 * - removed postMessage sync
 */
/* jshint eqeqeq:true, laxcomma:true, laxbreak:true */
(function(window) {

// define constants and private variables
var  REGEX_ALL_ALPHA = /^[a-zA-Z]+$/
    ,IN_IFRAME = window.parent !== window
    ,ddt = window.ddt // capture existing ddt object
    ,util = {} // private utility methods
    ,channels = {}; // list of potential channels

// if ddt was not predefined, create it now
if (typeof ddt !== 'object') {
    window.ddt = ddt = {};
}

// always start at version 1
ddt.version = 1;

// set any undefined configuration options to defaults
if (typeof ddt.config !== 'object') {
    ddt.config = {};
}
if (!ddt.config.cookie) {
    ddt.config.cookie = 'ddt_watch';
}
if (!ddt.config.domains) {
    ddt.config.domains = [window.location.host.split('.').slice(-2).join('.')];
}
if (!ddt.config.days) {
    ddt.config.days = 90;
}

// cookie helpers
util.cookie = {};

// gets the cookie for the current domain
// config: ddt.config.cookie
util.cookie.get =  function() {
    var  regex  = new RegExp('(?:^|; )' + encodeURIComponent(ddt.config.cookie) + '=([^;]+)')
        ,result = regex.exec(document.cookie);
    return result ? String(decodeURIComponent(result[1])).split(',') : [];
};

// sets the cookie for all domains by loading an image from each domain
// config: ddt.config.server, ddt.config.domains
util.cookie.set = function(expires) {
    var cookie = encodeURIComponent(ddt.config.cookie)
        ,channels = ddt.watching.join(',')
        ,domain = window.location.host
        ,date = new Date
        ,i;

    date.setTime(date.getTime() + ((expires || ddt.config.days) * 24 * 60 * 60 * 1000));

    // ensure there is a matching domain to delete
    for (i = 0; i < ddt.config.domains.length; i++) {
        // typically the configured domain will be less restrictive, which is
        // why we search for the configured domain inside the current domain.
        if (domain.indexOf(ddt.config.domains[i]) !== -1) {
            document.cookie = cookie + '=' + channels
                + '; expires=' + expires.toUTCString()
                + '; path=/'
                + '; domain=.' + ddt.config.domains[i];

            return ++ddt.version;
        }
    }

    return false;
};

// deletes the cookie for the current domain
util.cookie.del = function() {
    return util.cookie.set(-1);
};

// get a regex that will match all domain URLs
util.regex = function() {
    return new RegExp('^(https?:)?\\/\\/([^.]+\\.)?(' + ddt.config.domains.join('|').replace('.', '\\.') + ')\\b', 'i');
};

// console proxy generator
util.proxy = function(type) {
    if (!console || !(type in console)) {
        console.warn('[ddt] cannot proxy this method, it is not defined in console', type);
        return function() {};
    }
    return function(name, message /*, ... */) {
        var params;
        channels[name] = name;
        if (ddt.watching(name)) {
            params = Array.prototype.slice.call(arguments, 1);
            // reformat the message to include the package name
            params[0] = '[' + name + '] ' + message;
            console[type].apply(console, params);
        }
    };
};

// helper for supporting two styles of invocation:
// func('foo', 'bar', 'baz')
// func(['foo', 'bar', 'baz'])
util.args = function(args) {
    if (!args.length) {
        return false;
    }
    args = Array.prototype.slice.call(args, 0);
    if (args[0] instanceof Array) {
        return args[0];
    }
    return args;
};

// helper for warning about invalid package name
util.warning = function(method, channel) {
    return console.warn('[ddt] invalid channel name', channel, 'when calling', method);
};

// create DDT within a separate closure to ensure that the watched list is
// never directly manipulated by any utility method. if multiple DDT instances
// were allowed, this would be a globally available functional decorator.
(function() {

// private variables for DDT
var  watched = {};

// set up the ddt -> console proxy methods.
ddt.log   = util.proxy('log');
ddt.info  = util.proxy('info');
ddt.warn  = util.proxy('warn');
ddt.error = util.proxy('error');

// proxy trace as log + trace
ddt.trace = function(name /*, message, ... */) {
    if (ddt.watching(name)) {
        ddt.log.apply(ddt, arguments);
        console.trace();
    }
};

ddt.reset = function(names) {
    var i;
    names = util.args(arguments);
    watched = {}; // reset watched list
    if (!names) {
        return false;
    }
    for (i = 0; i < names.length; i++) {
        if (REGEX_ALL_ALPHA.test(names[i])) {
            watched[names[i].toLowerCase()] = true;
        } else {
            util.warning(names[i]);
        }
    }
    return true;
};

// start watching a channel
ddt.watch = function(names) {
    var  changed = false
        ,i;
    names = util.args(arguments);
    if (!names) {
        return false;
    }
    for (i = 0; i < names.length; i++) {
        if (REGEX_ALL_ALPHA.test(names[i])) {
            watched[names[i].toLowerCase()] = changed = true;
        } else {
            util.warning(names[i]);
        }
    }
    if (changed) {
        util.cookie.set();
        return true;
    }
    return false;
};

// stop watching a channel
ddt.unwatch = function(names) {
    var  changed = false
        ,name
        ,i;
    names = util.args(arguments);
    if (!names) {
        return false;
    }
    for (i = 0; i < names.length; i++) {
        if (REGEX_ALL_ALPHA.test(name)) {
            name = names[i].toLowerCase();
            if (name in watched) {
                delete watched[name];
                changed = true;
            }
        } else {
            util.warning(names[i]);
        }
    }
    if (changed) {
        util.cookie.set();
        return true;
    }
    return false;
};

// am i watching channel X?
// or what channels am i watching?
ddt.watching = function(name) {
    var watching = [];
    if (name) {
        return name.toLowerCase() in watched;
    }
    for (name in watched) {
        watching.push(name);
    }
    return watching;
};

// what channels are available?
ddt.channels = function() {
    var  list = []
        ,c;
    for (c in channels) {
        list.push(c);
    }
    return list;
};

})();

// load saved channels list, if it exists
if (ddt.reset(util.cookie.get()) && !IN_IFRAME) {
    console.log('[ddt] watching', ddt.watching());
}

})(window);
