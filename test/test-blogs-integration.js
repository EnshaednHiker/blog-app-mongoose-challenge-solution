const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

function seedBlogData() {
  console.info('seeding restaurant data');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogData());
  }
  
  // this will return a promise
  return BlogPost.insertMany(seedData);
}

// used to generate data to put in db
function generateBlogTitle() {
  const titles = [
    'Good Coffee, Good Morning', 'Great Coffee, Great Morning', 'Bad Coffee, Bad Morning', 'Worst Coffee, Worst Morning', 'Perfect Morning, Perfect Coffee'];
  return titles[Math.floor(Math.random() * titles.length)];
}

// used to generate data to put in db
function generateBlogAuthor() {
  const authors = [{firstName:'Ira', lastName: 'Glass'},{firstName:'Chuck', lastName: 'Norris'},{firstName:'George', lastName: 'Lucas'}];
  return authors[Math.floor(Math.random() * authors.length)];
}

// used to generate data to put in db
function generateContent() {
  const content = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
  return content
}

// generate an object represnting a restaurant.
// can be used to generate seed data for db
// or request.body data
function generateBlogData() {
  return {
    author: generateBlogAuthor(),
    title: generateBlogTitle(),
    content: generateContent(),
    created: faker.date.past()
  }
}


// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure data from one test does not stick
// around for next one
function tearDownDb() {
    console.warn('Deleting database');
    return mongoose.connection.dropDatabase();
}

describe('Blog API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedRestaurantData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  })

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing blog posts', function() {
      // strategy:
      //    1. get back all blog posts returned by by GET request to `/blog-posts`
      //    2. prove res has right status, data type
      //    3. prove the number of blog posts we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
            console.log(_res);
          // so subsequent .then blocks can access resp obj.
          res = _res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.should.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          res.body.should.have.length.of(count);
        });
    });


    it('should return blog posts with right fields', function() {
      // Strategy: Get back all blog posts, and ensure they have expected keys

      let resBlogPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
            
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.should.have.length.of.at.least(1);

          res.body.forEach(function(blog) {
            blog.should.be.a('object');
            blog.should.include.keys('id', 'title', 'content', 'author', 'created');
          });
          resBlogPost = res.body[0];
          return BlogPost.findById(resBlogPost.id);
        })
        .then(function(blog) {

          resBlogPost.id.should.equal(blog.id);
          resBlogPost.title.should.equal(blog.title);
          resBlogPost.content.should.equal(blog.content);
          resBlogPost.author.should.equal(`${blog.author.firstName} ${blog.author.lastName}`);
        });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the blog post we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new blog post', function() {

      const newBlog = generateBlogData();
      
      return chai.request(app)
        .post('/posts')
        .send(newBlog)
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys('id', 'title', 'content', 'author', 'created');
          res.body.title.should.equal(newBlog.title);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          res.body.content.should.equal(newBlog.content);
          res.body.author.should.equal(`${newBlog.author.firstName} ${newBlog.author.lastName}`);
          
          return BlogPost.findById(res.body.id);
        })
        .then(function(blog) {
          blog.author.firstName.should.equal(newBlog.author.firstName);
          blog.author.lastName.should.equal(newBlog.author.lastName);
          blog.title.should.equal(newBlog.title);
          blog.content.should.equal(newBlog.content);
          blog.id.should.not.be.null;
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing C from db
    //  2. Make a PUT request to update that blog
    //  3. Prove v returned by request contains data we sent
    //  4. Prove V in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        title: 'Ridiculously Good Coffee, Ridiculously Good Morning',
        author: {firstName: "Ira", lastName: "Flato"}
      };

      return BlogPost
        .findOne()
        .exec()
        .then(function(blog) {
          updateData.id = blog.id;

          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${blog.id}`)
            .send(updateData);
        })
        .then(function(res) {
          res.should.have.status(201);

          return BlogPost.findById(updateData.id).exec();
        })
        .then(function(blog) {
          blog.title.should.equal(updateData.title);
          blog.author.firstName.should.equal(updateData.author.firstName);
          blog.author.lastName.should.equal(updateData.author.lastName);
        });
      });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a blog
    //  2. make a DELETE request for that blog's id
    //  3. assert that response has right status code
    //  4. prove that restaurant with the id doesn't exist in db anymore
    it('delete a restaurant by id', function() {

      let blog;

      return BlogPost
        .findOne()
        .exec()
        .then(function(_blog) {
          blog = _blog;
          return chai.request(app).delete(`/posts/${blog.id}`);
        })
        .then(function(res) {
          res.should.have.status(204);
          return BlogPost.findById(blog.id).exec();
        })
        .then(function(_blog) {
          // when a variable's value is null, chaining `should`
          // doesn't work. so `_blog.should.be.null` would raise
          // an error. `should.not.exist(_blog)` is how we can
          // make assertions about a null value.
          should.not.exist(_blog);
        });
    });
  }); 
});
