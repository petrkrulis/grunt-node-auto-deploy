var path = require('path');
var exec = require('child_process').exec;

var checkForError = function(message) {
  return 'if [ \\$? -ne 0 ] ; then '
       + '  echo error: ' + message + ' ; exit 1 ; '
       + 'fi ; ';
};

var generateNginxScript = function(settings) {
  return 'upstream ' + settings.appurl + ' {\n'
       + '  server 127.0.0.1:' + settings.port + ';\n'
       + '}\n\n'
       + 'server {\n'
       + '  listen 80;\n'
       + '  client_max_body_size 4G;\n'
       + '  server_name ' + settings.appurl + ';\n\n'
       + '  keepalive_timeout 5;\n\n'
       + '  location / {\n'
       + '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
       + '    proxy_set_header Host $http_host;\n'
       + '    proxy_redirect off;\n'
       + '    proxy_pass http://' + settings.appurl + ';\n'
       + '  }\n'
       + '}\n';
};

var generateUpstartScript = function(settings) {
  return 'description "' + settings.appurl + ' node process"\n\n'
       + 'start on runlevel [2]\n'
       + 'stop on runlevel [016]\n\n'
       + 'console owner\n'
       + 'chdir "' + settings.path + '/' + settings.appurl + '"\n'
       + 'env NODE_ENV=production\n'
       + 'exec ' + settings.command + ' >> /var/log/' + settings.appurl + '.log 2>&1\n'
       + 'respawn\n'
       + 'respawn limit 5 15\n';
};

var createDeployScript = function(settings) {
  var apppath = path.join(settings.path, settings.appurl);

  var nginxTo = path.join(settings.nginx, settings.appurl + '.conf');
  var upstartTo = path.join('/etc/init', settings.appurl + '.conf');
  
  // Generate scripts and encode them because of special chars like ";".
  var upstartFile = new Buffer(generateUpstartScript(settings));
  var nginxFile = new Buffer(generateNginxScript(settings));
  var nginxEncoded = nginxFile.toString('base64');
  var upStartEncoded = upstartFile.toString('base64');
  

  // check server has required dependencies
    return 'for dependency in nginx git node npm ; do '
         + 'if ! which \\$dependency > /dev/null ; then '
         + '  echo error: server missing is nginx, git, node or npm ; '
         + '  exit 1 ; '
         + 'fi ; '
         + 'done ; '

       // check the supplied sites-enabled path is valid
       + 'if [ ! -d \\"' + settings.nginx + '\\" ] ; then '
       + '  echo error: nginx sites-enabled path ' + settings.nginx + ' does not exist ; '
       + '  exit 1 ; '
       + 'fi ; '

       // add SSH exception for github.com in order to connect without interruption
       + 'if ! grep -Fxq \\"Host github.com\\" ~/.ssh/config ; then '
       + '  echo -e \\"Host github.com\\n\\tStrictHostKeyChecking no\\n\\" >> ~/.ssh/config ;'
       + 'fi ;'

       // create the 'app path on server' directory if it doesn't exist
       + 'if [ ! -d \\"' + settings.path + '\\" ] ; then '
       + '  mkdir -p \\"' + settings.path + '\\" ; '
       + 'fi ; '

       // stop any existing app instance
       + 'stop ' + settings.appurl + ' > /dev/null ; '

       // if there's no repo, clone it for the first time
       + 'if [ ! -d \\"' + apppath + '\\" ] ; then '
       + '  git clone ' + settings.git + ' \\"' + apppath + '\\" > /dev/null ; '
       + checkForError('failed to clone ' + settings.git)
       + 'fi ; '

       // move into application directory
       + 'cd \\"' + apppath + '\\" ; '

       // fetch upstream changes on all branches
       + 'git fetch > /dev/null ; '
       + checkForError('failed to fetch upstream changes')

       // create tracking branch – may fail if there's already one, but that's ok
       + 'git branch ' + settings.branch + ' origin/' + settings.branch + ' > /dev/null ; '

       // checkout new/existing tracking branch
       + 'git checkout ' + settings.branch + ' > /dev/null ; '
       + checkForError('failed to checkout tracking branch ' + settings.branch)

       // pull latest changes from branch
       + 'git pull origin ' + settings.branch + ' > /dev/null ; '
       + checkForError('failed to pull changes on ' + settings.branch)

       // copy the nginx and upstart config files to correct locations
       + 'echo "' + upStartEncoded + '" | cat > ' + upstartTo + '.tmp ; '
       + 'echo "' + nginxEncoded + '" | cat > ' + nginxTo + '.tmp ; '
       + 'base64 -d ' + nginxTo + '.tmp > ' + nginxTo + ' ; '
       + 'base64 -d ' + upstartTo + '.tmp > ' + upstartTo + ' ; '
       + 'rm ' + nginxTo + '.tmp ; '
       + 'rm ' + upstartTo + '.tmp ; '        
        
       // reload nginx config
       + 'nginx -s reload > /dev/null ; '
       + checkForError('failed to reload nginx configuration')
        
       // install missing npm dependencies
       + 'npm install > /dev/null ; '
       + checkForError('failed to install npm dependencies')
        
       // start a new app instance
       + 'start ' + settings.appurl + ' > /dev/null ; '
       + checkForError('application failed to start')
       + 'exit ; ';
};

var createVerifyScript = function(settings) {
  return 'initctl status \\"' + settings.appurl + '\\" | grep process > /dev/null ; '
       + checkForError('application failed to start');
};

var createRemoveScript = function(settings) {
  var apppath = path.join(settings.path, settings.appurl);
  var nginxConfig = path.join(settings.nginx, settings.appurl);
  var upstartConfig = path.join('/etc/init', settings.appurl + '.conf');

  // check that application exists
  return 'if [ ! -d \\"' + apppath + '\\" ] ; then '
       + '  echo error: application path ' + apppath + ' does not exist ; '
       + '  exit 1 ; '
       + 'fi ; '

       // check that the nginx sites-enabled directory exists
       + 'if [ ! -d \\"' + settings.nginx + '\\" ] ; then '
       + '  echo error: nginx sites-enabled path ' + settings.nginx + ' does not exist ; '
       + '  exit 1 ; '
       + 'fi ; '

       // stop any existing app instance
       + 'stop ' + settings.appurl + ' > /dev/null ; '

       // remove config files and app directory
       + 'rm -f \\"' + nginxConfig + '\\" ; '
       + 'rm -f \\"' + upstartConfig + '\\" ; '
       + 'rm -rf \\"' + apppath + '\\" ; '

       // reload nginx config
       + 'nginx -s reload > /dev/null ; ';
};

var execute = function(server, commands, callback) {
  exec('ssh -A ' + server + ' "' + commands + '"', function(err, output) {
    if (output) console.log(output.trim());

    if (err) {
      if (!output) console.log('error: failed to connect to server');

      process.exit(1);
    }

    callback && callback();
  });
  
  console.log('executed');
};

var run = function(settings) {
  var verify = function() {
    execute(settings.ssh, createVerifyScript(settings));
  };
  
  execute(settings.ssh, createDeployScript(settings), function(output) {
    console.log('deploy ok – verifying');
    setTimeout(verify, 15000);
  });
};

var remove = function(settings) {
  execute(settings.ssh, createRemoveScript(settings));
};

module.exports = {
  run: run,
  remove: remove
};
