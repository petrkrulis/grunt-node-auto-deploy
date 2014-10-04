/*
 * grunt-node-auto-deploy
 * https://github.com/petrkrulis.cz/grunt-node-auto-deploy
 *
 * Copyright (c) 2014 Petr Krulis
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  grunt.registerMultiTask('node_auto_deploy', 'Automatic deployment of your node apps via grunt to nginx-upstart server.', function() {
    var options = this.options();
    var deploy = require('../lib/deploy');
    
    // Print deploying message.
    grunt.log.writeln('\nDeploying ' + options.branch + ' ' + 'to ' + options.ssh + ':' + options.path + '/' + options.url + '\n');
    
    // Run deployment
    deploy.run(options, this.async(), grunt);
  });
};
