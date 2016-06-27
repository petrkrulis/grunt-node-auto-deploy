# grunt-node-auto-deploy

Automatic deployment of your node apps via grunt to ubuntu server using nginx and upstart. 

### About
The task connects to your server via SSH (via ssh key only) and writes nginx & upstart configuration files. Your app starts on boot a runs as a service. Application is cloned or pulled from it's remote git repository. When the app is cloned/pulled, task runs npm install together with optional commands like grunt tasks to build distribution files. Then it reloads nginx :)

### Dependencies
This grunt task requires you to have linux server with upstart (ubuntu tested) running nginx, nodejs, npm and git.

### Issues
Please report all issues you may find. Do it preferably at https://github.com/petrkrulis/grunt-node-auto-deploy/issues. It'll be very helpful.

### Changelog

#### 0.6.3
- updated dependencies (mainly grunt 1.x.x)

#### 0.6.2
- /etc/init scripts are saved to the /etc/init/apps subfolder

#### 0.6.1
- Fixed fatal bug

#### 0.6.0
- Conf property
- Alias is now a redirect instead of standalone server

#### 0.5.8
- Properly close SSH connection after deployment

#### 0.5.5
- Removed unwanted console output

#### 0.5.4
- Added support for domain alias (so you can add www subdomain easily)
- Fixed optional commands order

## Getting Started
This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-node-auto-deploy --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-node-auto-deploy');
```

## The "node_auto_deploy" task

### Overview
In your project's Gruntfile, add a section named `node_auto_deploy` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  node_auto_deploy: {
    options: {
      url: 'petrkrulis.cz',
      alias: ['www.petrkrulis.cz', 'alias.petrkrulis.cz'],
      conf: true,
      command: 'node server.js',
      port: '8081',
      path: '/var/www/sites',
      nginx: '/etc/nginx/sites-enabled',
      git: 'git://github.com/petrkrulis.cz/grunt-node-auto-deploy.git',
      branch: 'master',
      ssh: 'user@12.34.56.78',
      before: [
        'echo hello'
      ],
      then: [
        'grunt build'
      ]
    }
  },
});
```

### Options

#### options.url
Type: `String`

The URL of your app. If you don't own a domain name yet, just pass example.com to it and add that domain to your hosts file. You can test the app from the browser then.

#### options.alias
Type: `String` or `Array` (optional)

Alias is optional. Use it to redirect for example a www subdomain to your app.

#### options.conf
Type: `Boolean` (optional)

Whether to upload ngnix configuration files. Default value is true (will be uploaded). If you need to manage conf files by yourself, let the plugin know not to upload them. 

#### options.command
Type: `String`

Command used to start the app. Mostly it'll be something like 'node app.js' but you can use anything you need. 

#### options.port
Type: `String`

NodeJS application port (where the server is listening for connections).

#### options.path
Type: `String`

Absolute path to the app. This task takes the options.path path, creates a folder named by the options.url in it and clone the git repository specified in options.git.

#### options.nginx
Type: `String`

Path to ngnix sites-enabled folder. Or basicaly any folder where nginx automatically load all conf files and use them in it's configuration. 

#### options.git
Type: `String`

Git repository to clone. It should contain the app you want to run :)

#### options.branch
Type: `String`

The branch which will be cloned from the git repository.

#### options.ssh
Type: `String`

SSH server adress. Use ssh key to login instead of password. I decided not to add support for password access. It's insecure and slow and you would need to type itevery time (you don't want to store the password in a gruntfile).

#### options.before
Type: `Array` (optional)

It's an optional array of commands executed before anything else. All commands in options.before & options.then are executed from application path (the app's root where package.json is stored).

#### options.then
Type: `Array` (optional)

It's an optional array of commands executed after successful deploy and npm install and before start command. Useful as hell if you dont want to include distribution files to git repository. You can easily build them on server, just include all necessary packages in dependecies (not only in devDependencies - this runs in production environment).   

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).
