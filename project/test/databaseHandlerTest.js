process.env['database:db'] = 'social_website_test';

require('should');
var Q = require('q');
var ObjectId = require('mongodb').ObjectId;

var config = require('../lib/config');
var DatabaseHandler = require('../lib/databaseHandler');
var UserSecurity = require('../lib/userSecurity');
var errors = require('../lib/errors');
var mongodb = require('mongodb');

describe('DatabaseHandler', function() {
  var db = null;
  var dbHandler = new DatabaseHandler();
  var length = config.get("security:sessions:tokenLength");
  var tokenPattern = new RegExp("^[" + config.get('security:sessions:tokenChars') + "]{" + length + "}$");
  dbHandler.connect();

  var cleanCollection = function(done, collection) {
    db.collection(collection).removeMany();
    done();
  };

  before(function(done) {
    // Make sure tests are run on test db
    var pattern = /_test$/;

    if (!pattern.test(config.get('database:db'))) {
      console.error("DB used for testing should end with '_test'");
      process.exit(1);
    }
    mongodb.MongoClient.connect(
      config.get('database:address') + config.get('database:db'),
      function(err, _db) {
        db = _db;
        dbHandler.connect().then(() => done());
    });

  });

  describe("General database functions", function() {
    describe("Attempt to make query when db is closed", function() {

      it('should return a DatabaseError', function(done) {
        dbHandler.close();
        dbHandler.getUser({username: 'uname'}).catch(function(err){
          err.should.be.instanceOf(errors.DatabaseError);
          done();
        }).done() ;
      });

      after(dbHandler.connect);
    });
  });

  describe('registerUser', function() {
    after((done) => cleanCollection(done, config.get('database:collections:auth')));

      describe('Create valid user', function() {
        it('should return a newly registered user with id', function(done) {
          dbHandler.registerUser({username:'name', password:'pw'}).then(function(res) {
            res.username.should.equal('name');
            res.password.should.equal('pw');
            tokenPattern.test(res.token).should.be.true();
            done();
          }).done();
        });
      });

    describe('Attempt to create user with taken username', function() {
      var username = "uname";

      before(function(done) {
        dbHandler.registerUser({'username': username, password: 'pw'}).then(() => done()).done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return an ArgumentError', function(done) {
        dbHandler.registerUser({'username': username, password: 'otherpw'}).catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          done();
        }).done();
      });
    });

    describe('Attempt to create user without specifying all parameters', function() {
      it('should return an ArgumentError', function(done) {
        dbHandler.registerUser({username:'', password:'pw'}).catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          done();
        }).done();
      });
    });

    describe('Attempt to add extra, non-valid, parameters', function() {
      it('should return an ArgumentError', function(done) {
        dbHandler.registerUser({username:'username', password:'pw', extra:'aaa'}).catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          done();
        }).done();
      });
    });

  });

  describe("getUser", function() {
    describe('Get existing user', function() {
      var id = null;
      after(done => cleanCollection(done, config.get('database:collections:auth')));

      before('Create user to find', function(done) {
        dbHandler.registerUser({username:'uname', password:'pw'}).then(function(res) {
          id = res._id;
          done();
        }).done();
      });

      it('should return the correct user', function(done) {
        dbHandler.getUser({username: 'uname'})
          .then(function(res) {
            res._id.should.equal(id);
            return dbHandler.getUser({_id: id});})
          .then(function(res) {
            res.username.should.equal('uname');
            done();
        }).done();
      });
    });

    describe('Get non-existant user', function() {
      it('should return null', function(done) {
        dbHandler.getUser({username: 'uname'}).then(function(res) {
          (res === null).should.be.true();
          done();
        }).done();
      });
    });

    describe('Call with no parameters', function() {
      it('should return ArgumentError', function(done) {

        dbHandler.getUser({}).then(null, function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          return dbHandler.getUser({username: ' '});
        }).catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          done();
        }).done();
      });
    });
  });

  describe("updateToken", function() {
    describe('Update token of existing user', function() {
      var id = null;
      var token = null;

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      before('Create a user to update', function(done) {
        dbHandler.registerUser({username: 'uname', password: 'pw'})
        .then(
          function(res) {
            token = res.token;
            id = res._id;
            tokenPattern.test(token).should.be.true();
            done();
          })
        .done();
      });

      it('should return new token', function(done) {
        dbHandler.updateToken(id).then(function(res) {
          tokenPattern.test(res).should.be.true();
          res.should.not.equal(token);
          done();
        }).done();
      });
    });

    describe('Attempt to update non-existant user', function() {
      it('should return an ArgumentError', function(done) {
        dbHandler.updateToken((new mongodb.ObjectId()).toString())
        .catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          done();
        }).done();
      });
    });

    describe('Attempt to update invalid id', function() {
      it('should return ArgumentError', function(done) {
          dbHandler.updateToken("a")
          .catch(function(err) {
            err.should.be.instanceOf(errors.ArgumentError);
            done();
          }).done();
      });
    });
  });

  describe("updatePassword", function() {
    describe("Update password of existing user w/o updating token", function() {
      var id = null;
      var password = "adecentpassword";
      var token = null;

      before('Create user to update', function(done) {
        dbHandler.registerUser({username:'uname', 'password':password})
        .then(function(res) {
          id = res._id;
          token = res.token;
          done();
        }).done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return user with new password and old token', function(done) {
        dbHandler.updatePassword(id, 'newpassword', false)
        .then(function(val) {
          val.password.should.not.equal(password);
          val.token.should.equal(token);
          done();
        })
        .done();
      });
    });

    describe("Update password and token of existing user", function() {
      var id = null;
      var password = "adecentpassword";
      var token = null;

      before(function(done) {
        dbHandler.registerUser({username: 'uname', password: 'pw'})
        .then(
          function(res) {
            token = res.token;
            id = res._id;
            tokenPattern.test(token).should.be.true();
            done();
          })
        .done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return user with new password and old token', function(done) {
        dbHandler.updatePassword(id, 'newpassword', true)
        .then(function(val) {
          val.password.should.not.equal(password);
          val.token.should.not.equal(token);
          done();
        })
        .done();
      });
    });
  });

  describe('getManyById', function() {
    describe('Get single user', function() {
      var id = null;
      var uname = 'username';

      before(function(done) {
        dbHandler.registerUser({username: uname, password: 'pw'})
        .then((res) => id = res._id)
        .then(() => done());
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return the correct user', function(done) {
        dbHandler.getManyById([id])
        .then((res) => res[0].username.should.equal(uname))
        .then(() => done())
        .done();
      });
    });

    describe('Get multiple users', function() {
      var users = [];

      before("Register three users", function(done) {
        Q.all([
          dbHandler.registerUser({username: 'uname', password: 'pw'}),
          dbHandler.registerUser({username: 'usname', password: 'pw'}),
          dbHandler.registerUser({username: 'ulname', password: 'pw'})
        ])
        .then((results) => users = results)
        .then(() => done())
        .done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return the correct two users', function(done) {
        var ids = [users[0]._id, users[1]._id];
        dbHandler.getManyById(ids)
        .then(function(res) {
          res.length.should.equal(2);
          res[0]._id.should.equal(users[0]._id);
          res[0].username.should.equal(users[0].username);
          res[1]._id.should.equal(users[1]._id);
          res[1].username.should.equal(users[1].username);
        })
        .then(() => done())
        .done();
      });
    });


    describe('Send only id', function() {
      it('should return an ArgumentError', function(done) {
        dbHandler.getManyById((new ObjectId()).toString())
        .catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          done();
        });
      });
    });

    describe('Enter an invalid id', function() {
      it('should return an ArgumentError', function(done) {
        var ids = [(new ObjectId()).toString(), null];
        dbHandler.getManyById(ids)
        .catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
          done();
        });
      });
    });
  });

  describe('searchUsers', function() {
    describe('Search for a single user', function() {

      var user = null;

      before(function(done) {
        dbHandler.registerUser({username: 'usname', password: 'pw'})
        .then((res) => user = res)
        .then(() => done())
        .done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return the correct user', function() {
        dbHandler.searchUsers('usname')
        .then(function(res) {
          res._id.should.equal(user._id);
          res.username.should.equal(user.username);
        })
        .then(() => done())
        .done();
      });
    });

    describe('Search with keyword matching two of three users', function() {
      var users = [];

      before("Register three users", function(done) {
        Q.all([
          dbHandler.registerUser({username: 'userOne', password: 'pw'}),
          dbHandler.registerUser({username: 'NotCorrect', password: 'pw'}),
          dbHandler.registerUser({username: 'userTwo', password: 'pw'})
        ])
        .then((results) => users = results)
        .then(() => done())
        .done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return the correct two users', function(done) {
        dbHandler.searchUsers('user')
        .then(function(res) {
          res.length.should.equal(2);
          [users[0], users[2]].should.eql(res);
        })
        .then(() => done())
        .done();
      });
    });

    describe('Search with empty searchword', function() {
      it('should return an ArgumentError', function(done) {
        dbHandler.searchUsers('')
        .catch(function(err) {
          err.should.be.instanceOf(errors.ArgumentError);
        })
        .then(() => done())
        .done();
      });
    });
  });

  describe('newMessage', function() {
    describe('Insert a new valid message', function() {
      var users = null;
      before("Register two users", function(done) {
        Q.all([
          dbHandler.registerUser({username: 'userOne', password: 'pw'}),
          dbHandler.registerUser({username: 'NotCorrect', password: 'pw'})
        ])
        .then((results) => users = results)
        .then(() => done())
        .done();
      });

      after(function(done) {
        cleanCollection(done, config.get('database:collections:auth'));
        cleanCollection(done, config.get('database:collections:messages'));
        done();
      });

      it('should return a valid message', function(done) {
        dbHandler.newMessage(users[0]._id, users[1]._id, 'hello')
        .then(function(res) {
            res.from.should.equal(users[0]._id);
            res.to.should.equal(users[1]._id);
            res.message.should.equal('hello');
            ObjectId.isValid(res._id).should.be.true();
            done();
        })
        .done();
      });
    });

    describe('Attempt to insert messages where one user does not exist', function() {
      var id = null;
      before(function(done) {
        dbHandler.registerUser({username: 'usname', password: 'pw'})
        .then((res) => id = res._id)
        .then(() => done())
        .done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return ArgumentError in both cases', function(done) {
        dbHandler.newMessage(id, (new ObjectId()).toString(), 'hello')
        .catch((err) => err.should.be.instanceOf(errors.ArgumentError))
        .then(() => dbHandler.newMessage((new ObjectId()).toString(), id, 'hello'))
        .catch((err) => err.should.be.instanceOf(errors.ArgumentError))
        .then(() => done());
      });
    });

    describe('Attempt to insert empty message', function() {
      var users = null;
      before("Register two users", function(done) {
        Q.all([
          dbHandler.registerUser({username: 'userOne', password: 'pw'}),
          dbHandler.registerUser({username: 'NotCorrect', password: 'pw'})
        ])
        .then((results) => users = results)
        .then(() => done())
        .done();
      });

      after((done) => cleanCollection(done, config.get('database:collections:auth')));

      it('should return an ArgumentError', function(done) {
        dbHandler.newMessage(users[0]._id, users[1]._id, '')
        .catch((err) => err.should.be.instanceOf(errors.ArgumentError))
        .then(() => done())
        .done();
      });
    });
  });

  after(() => db.close());
});
