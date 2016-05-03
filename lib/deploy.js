var path = require('path');
var inquirer = require("inquirer");
var spawn = require('child_process').spawn;
var ssh;

var grunt;
var settings;
var timeout;
var position;
var responseBuffer;
var readyLine;
var lastCommand;
var lastDescription;
var applicationPath;
var logState;
var nginxPath;
var upstartPath;
var commands;

var done;
var readyRegExp = new RegExp( /(\w)+@(.)+:(.)+/ );

var commonErrors = [ ' error ', 'error:', 'failed', 'fatal', 'unable', 'wrong' ];

var buildCommands = function() {
  commands = [];
    commands.push({
      command: '[ -d ' + settings.nginx + ' ] && echo true || echo false',
      description: 'Checking nginx path validity',
      callback: function( output ) {
        if( output[output.length - 1].indexOf( 'true' ) > -1 ) {
          next();
        } else {
          error( 'The nginx path ' + settings.nginx + ' is not valid.', true );
        }
      }
    });

    commands.push({
      command: 'grep -Fx "Host github.com" ~/.ssh/config',
      callback: function( output ) {
        if( output.length < 1) {
          processCommand({ command: 'echo -e "Host github.com\\n\\tStrictHostKeyChecking no\\n\\n" >> ~/.ssh/config', description: 'Writing SSH configuration' });
        } else {
          next();
        }
      }
    });

    commands.push({
      command: 'grep -Fx "Host bitbucket.org" ~/.ssh/config',
      callback: function( output ) {
        if( output.length < 1) {
          processCommand({ command: 'echo -e "Host bitbucket.org\\n\\tStrictHostKeyChecking no\\n\\n" >> ~/.ssh/config', description: 'Writing SSH configuration' });
        } else {
          next();
        }
      }
    });

    commands.push({
      command: 'mkdir -p ' + settings.path,
      description: 'Creating folders'
    });

    commands.push({
      command: 'stop ' + settings.url + ' > /dev/null',
      description: 'Stopping application'
    });
    
    commands.push({
      command: '[ -d ' + path.join( applicationPath, '.git' ) + ' ] && echo true || echo false',
      callback: function( output ) {
        if( output[output.length - 1].indexOf( 'true' ) > -1 ) {
          next(1);
        } else {
          next();
        }
      }
    });

    commands.push({
      command: 'git clone ' + settings.git + ' ' + applicationPath,
      description: 'cloning git repository',
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot clone git repository.\nError: ' + output.join('\n'), false, next ); 
        }
      }
    });

    commands.push({
      command: 'cd ' + applicationPath
    });

    commands.push({
      command: 'git fetch',
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot fetch git repository.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Fetching git repository'
    });

    commands.push({
      command: 'git branch ' + settings.branch + ' origin/' + settings.branch,
      description: 'Changing git branch'
    });

    commands.push({
      command: 'git checkout ' + settings.branch,
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot checkout git branch.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Checkouting git branch'
    });

    commands.push({
      command: 'git pull origin ' + settings.branch,
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot pull git branch.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Pulling git branch'
    });

    commands.push({
      command: 'echo ' + getUpstart() + ' | cat > ' + upstartPath + '.tmp',
      description: 'Uploading configuration files'
    });

    if (settings.conf) {
      commands.push({
        command: 'echo ' + getNginx() + ' | cat > ' + nginxPath + '.tmp',
      });

      commands.push({
        command: 'base64 -d ' + nginxPath + '.tmp > ' + nginxPath,
        callback: function( output ) {
          if( !hasCommonErrors( output ) ) {
            next();
          } else {
            error( 'Cannot decode uploaded base64 nginx configuration.\nError: ' + output.join('\n'), false, next ); 
          }
        }
      });
    };

    commands.push({
      command: 'base64 -d ' + upstartPath + '.tmp > ' + upstartPath,
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot decode uploaded base64 upstart configuration.\nError: ' + output.join('\n'), false, next ); 
        }
      }
    });

    if (settings.conf) {
      commands.push({
        command: 'rm ' + nginxPath + '.tmp',
        description: 'Removing temporary files'
      });
    };

    commands.push({
      command: 'rm ' + upstartPath + '.tmp'
    });

    commands.push({
      command: 'nginx -s reload',
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot restart nginx.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Restarting nginx'
    });

    commands.push({
      command: 'npm install',
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot install node dependencies.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Installing node dependencies'
    });
  
  if ( settings.before && settings.before.length > 0 ) {
    settings.before.reverse();
    for ( var i = 0; i < settings.before.length; i++ ) {
      commands.unshift({
        command: settings.before[i],
        description: 'Running ' + settings.before[i],
        callback: function( output ) {
          if( !hasCommonErrors( output ) ) {
            next();
          } else {
            error( 'Error processing command.\nError: ' + output.join('\n'), false, next ); 
          }
        }
      });
    }
  }
  
  commands.unshift({
    command: 'cd ' + applicationPath
  });
  
  if ( settings.then && settings.then.length > 0 ) {
    for ( var i = 0; i < settings.then.length; i++ ) {
      commands.push({
        command: settings.then[i],
        description: 'Running ' + settings.then[i],
        callback: function( output ) {
          if( !hasCommonErrors( output ) ) {
            next();
          } else {
            error( 'Error processing command.\nError: ' + output.join('\n'), false, next ); 
          }
        }
      });
    }
  }
  
  commands.push({
    command: 'start ' + settings.url,
    callback: function( output ) {
      if( !hasCommonErrors( output ) ) {
        next();
      } else {
        error( 'Cannot start application.\nError: ' + output.join('\n'), false, next ); 
      }
    },
    description: 'Starting application'
  });

  commands.push({
    command: 'exit',
    callback: function() {
      next();
    },
    description: 'Closing connection'
  });
}

var start = function() {
  responseBuffer = '';
  lastCommand = '';
  lastDescription = '';
  logState = 0;
  readyLine = '';
  position = -1;
  
  // Generate paths
  applicationPath = path.join( settings.path, settings.url );
  nginxPath = path.join( settings.nginx, settings.url + '.conf' );
  upstartPath = path.join( '/etc/init', settings.url + '.conf' );
  
  // Generate commands
  buildCommands();
  
  // Reset timeout
  resetTimeout();
  
  // Start SSH session
  ssh = spawn( 'ssh', ['-tt', '-o StrictHostKeyChecking=no', settings.ssh] );
  
  // Set encoding so output matches input and vice versa
  ssh.stdin.setEncoding( 'utf-8' );
  ssh.stdout.setEncoding( 'utf-8' );
  
  // Atach listeners
  ssh.stdout.on('data', function( data ) {
    data = data.toString();
    handleResponse( data );
  });
  
  ssh.stderr.on('data', function (data) {
    if(data.toString().toLowerCase().indexOf('connection') > -1 && data.toString().toLowerCase().indexOf('closed') > -1) {
      return;
    }
    error( 'Something went wrong. Error: ' + data.toString(), true );
  });
  
  ssh.on('close', function (code) {
    if (true) {
      next();
    } else {
      error( 'SSH connection closed.', true );
    }
  });
}

var handleResponse = function(data) {
  responseBuffer += data;
  var lines = responseBuffer.split( '\r' );
  
  // Check for password prompt
  if ( responseBuffer.toLowerCase().indexOf('password') > 0 && responseBuffer.indexOf(':') > 0 ) {
    // Ask for pass and send it
    inquirer.prompt([{  type: 'input',
                        name: 'pass',
                        message: 'Type password: '
                    }], function( answers ) {
        responseBuffer = '';
        ssh.stdin.write( answers['pass'] + '\n' );
    });
  } else {
    if ( readyLine ) {
      if ( lines[lines.length - 1].indexOf(readyLine) > -1 ) {
        var command = commands[position];
        lines.pop();
        if ( lines[0] == lastCommand ) lines.shift();
        if ( command.callback ) {
          command.callback( lines );
        } else {
          next();
        }
      }
      else {
        // Output is incomplete. Waiting...
      }
    } else {
      if ( readyRegExp.test(responseBuffer) ) {
        readyLine = String( lines[lines.length - 1] ).trim().split( ':' )[0];
        next();
      }
      else {
        // Readyline not found yet. Waiting...
      }
    }
  }
  
  resetTimeout();
}

var processCommand = function(holder) {
  var description = holder.description || '';
  var command = holder.command;
  
  if ( description && description != lastDescription) {
    grunt.log.writeln( description + '...' );
    logState = 1;
  }
  
  lastCommand = command;
  lastDescription = description;
  ssh.stdin.write( command + '\n');
}

var finalize = function( ok ) {
  ok = ok || false;
  
  try {
    // Detach listeners
    ssh.stdout.removeAllListeners( 'data' );
    ssh.stderr.removeAllListeners( 'data' );
    ssh.removeAllListeners( 'close' );
    
    // Stop timeout
    clearInterval(timeout);
    
    // Send exit command
    processCommand({
      command: 'exit'
    });
  } catch ( error ) {
    // We dont care
  }
  
  //Implement exit
  grunt.log.write( '\n' );
  done(ok);
}

var error = function( description, fatal, then ) {
  if( fatal ) {
    grunt.log.errorlns( 'Fatal error: ' + description );
    finalize( false );
  } else {
    grunt.log.warn( description );
    inquirer.prompt([{
      type: 'confirm',
      name: 'result',
      message: 'Do you want to continue execution'
    }], function( answers ) {
        if( answers['result'] ) {
          then();
        } else {
          finalize( false );
        }
    });
  }
}

var next = function( skip ) {
  skip = skip || 0;
  position += skip + 1;
  
  if (logState > 0) {
    grunt.log.ok( 'DONE' );
    logState = 0;
  }
  
  if ( position >= commands.length ) {
    finalize( true );
    return;
  }
  
  responseBuffer = '';
  setTimeout(doCommand, 300);
}

var doCommand = function() {
  processCommand(commands[position]);
}

var resetTimeout = function() {
  clearTimeout( timeout );
  timeout = setTimeout( timeouted, 180000 );
}

var timeouted = function() {
  error( 'Request timeouted.', true );
}

var hasCommonErrors = function( output ) {
  if( typeof output === 'array' ) output = output.join( ' ' );
  output = output.toString().toLowerCase();
  
  for( var i = 0; i < commonErrors.length; i++ ) {
    if( output.indexOf(commonErrors[i]) > -1 && output.indexOf( 'without error' ) < 0 ) {
      return true;
    }
  }
  return false;
}

var getURLs = function() {
  var alias = '';
  var urls = settings.url;
  if( settings.alias ) {
    if( Array.isArray( settings.alias ) ) {
      alias = settings.alias.join( ' ' );
    } else {
      alias = settings.alias;
    }
    urls += ' ' + alias;
  }
  return urls;
}

// Generate script and encode it because of special chars like ';'
var getNginx = function() {
  return new Buffer('upstream ' + settings.url + ' {\n'
    + '  server 127.0.0.1:' + settings.port + ';\n'
    + '}\n\n'
    + 'server {\n'
    + '  listen 80;\n'
    + '  client_max_body_size 4G;\n'
    + '  server_name ' + getURLs() + ';\n\n'
    + '  keepalive_timeout 5;\n\n'
    + '  location / {\n'
    + '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
    + '    proxy_set_header Host $http_host;\n'
    + '    proxy_set_header X-NginX-Proxy true;\n'
    + '    proxy_redirect off;\n'
    + '    proxy_pass http://localhost:' + settings.port + ';\n'
    + '    proxy_http_version 1.1;\n'
    + '    proxy_set_header Upgrade $http_upgrade;\n'
    + '    proxy_set_header Connection "upgrade";\n'
    + '  }\n'
    + '}\n').toString('base64');
};

var getUpstart = function() {
  return new Buffer('description "' + settings.url + ' node process"\n\n'
    + 'start on runlevel [2]\n'
    + 'stop on runlevel [016]\n\n'
    + 'console owner\n'
    + 'chdir "' + settings.path + '/' + settings.url + '"\n'
    + 'env NODE_ENV=production\n'
    + 'exec ' + settings.command + ' >> /var/log/' + settings.url + '.log 2>&1\n'
    + 'respawn\n'
    + 'respawn limit 5 15\n').toString('base64');
};

var run = function(options, callback, gruntObject) {
  done = callback;
  grunt = gruntObject;
  settings = options;
  start();
};

module.exports = {
  run: run
};