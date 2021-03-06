/*

//--------------------------------------------------------------------------------------------------//
//---------------------------------------- Table Of Contents ---------------------------------------//
//--------------------------------------------------------------------------------------------------//

---------------------------------------------------------------
#                             Config                          #
---------------------------------------------------------------

//

---------------------------------------------------------------
#                            Filters                          #
---------------------------------------------------------------

isLoggedIn
isLoggedOut
isAdmin

canView
canPost
canEditPost
canEditComment

hasCompletedProfile

---------------------------------------------------------------
#                          Controllers                        #
---------------------------------------------------------------

PostsListController
PostPageController

---------------------------------------------------------------
#                             Routes                          #
---------------------------------------------------------------

1) Paginated Lists
----------------------
Top
New
Best
Pending
Categories

2) Digest
--------------------
Digest

3) Posts
--------------------
Post Page
Post Page (scroll to comment)
Post Edit
Post Submit

4) Comments
--------------------
Comment Page
Comment Edit
Comment Submit

5) Users
--------------------
User Profie
User Edit
Forgot Password
Account
All Users
Unsubscribe (from notifications)
Sign Up
Sign In

6) Misc Routes
--------------------
Settings
Categories
Toolbox



*/


//--------------------------------------------------------------------------------------------------//
//--------------------------------------------- Config ---------------------------------------------//
//--------------------------------------------------------------------------------------------------//


Router.configure({
  layoutTemplate: 'layout',
  loadingTemplate: 'loading',
  notFoundTemplate: 'not_found',
});

//--------------------------------------------------------------------------------------------------//
//--------------------------------------------- Filters --------------------------------------------//
//--------------------------------------------------------------------------------------------------//

var filters = {

  nProgressHook: function () {
    if (this.ready()) {
      NProgress.done(); 
    } else {
      NProgress.start();
      this.stop();
    }
  },

  resetScroll: function () {
    var scrollTo = window.currentScroll || 0;
    $('body').scrollTop(scrollTo);
    $('body').css("min-height", 0);
  },

  isLoggedIn: function() {
    if (!(Meteor.loggingIn() || Meteor.user())) {
      throwError('Please Sign In First.')
      this.render('signin');
      this.stop(); 
    }
  },

  isLoggedOut: function() {
    if(Meteor.user()){
      this.render('already_logged_in');
      this.stop();
    }
  },

  isAdmin: function() {
    if(!Meteor.loggingIn() && Session.get('settingsLoaded') && !isAdmin()){
      throwError("Sorry, you  have to be an admin to view this page.")
      this.render('no_rights');
      this.stop(); 
    }
  },

  canView: function() {
    if(Session.get('settingsLoaded') && !canView()){
      this.render('no_rights');
      this.stop();
    }
  },

  canPost: function () {
    if(!Meteor.loggingIn() && Session.get('settingsLoaded') && !canPost()){
      throwError("Sorry, you don't have permissions to add new items.")
      this.render('no_rights');
      this.stop();      
    }
  },

  canEditPost: function() {
    var post = Posts.findOne(this.params._id);
    if(!Meteor.loggingIn() && Session.get('settingsLoaded') && !currentUserCanEdit(post)){
      throwError("Sorry, you cannot edit this post.")
      this.render('no_rights');
      this.stop();
    }
  },

  canEditComment: function() {
    var comment = Comments.findOne(this.params._id);
    if(!Meteor.loggingIn() && Session.get('settingsLoaded') && !currentUserCanEdit(comment)){
      throwError("Sorry, you cannot edit this comment.")
      this.render('no_rights');
      this.stop();
    }
  },

  hasCompletedProfile: function() {
    var user = Meteor.user();
    if (user && ! Meteor.loggingIn() && ! userProfileComplete(user)){
      // Session.set('selectedUserId', user._id);
      this.render('user_email');
      this.stop();
    }
  }

}

// Load Hooks

Router.load( function () {
  clearSeenErrors(); // set all errors who have already been seen to not show anymore
  Session.set('categorySlug', null); 
});

// Before Hooks

// Use nProgress on every route that has to load a subscription
Router.before(filters.nProgressHook, {only: [
  'posts_top', 
  'posts_new', 
  'posts_best', 
  'posts_pending', 
  'posts_digest',
  'posts_category', 
  'post_page',
  'post_edit',
  'comment_page',
  'comment_edit',
  'comment_reply',
  'user_edit',
  'user_profile',
  'all-users'
]});

Router.before(filters.hasCompletedProfile);
Router.before(filters.isLoggedIn, {only: ['comment_reply','post_submit']});
Router.before(filters.canView);
Router.before(filters.isLoggedOut, {only: ['signin', 'signup']});
Router.before(filters.canPost, {only: ['posts_pending', 'comment_reply', 'post_submit']});
Router.before(filters.canEditPost, {only: ['post_edit']});
Router.before(filters.canEditComment, {only: ['comment_edit']});
Router.before(filters.isAdmin, {only: ['posts_pending', 'all-users', 'settings', 'categories', 'toolbox']});

// After Hooks

Router.after(filters.resetScroll, {except:['posts_top', 'posts_new', 'posts_best', 'posts_pending', 'posts_category', 'all-users']});
Router.after( function () {
  analyticsRequest() // log this request with mixpanel, etc
});

// Unload Hooks

//

//--------------------------------------------------------------------------------------------------//
//------------------------------------------- Controllers ------------------------------------------//
//--------------------------------------------------------------------------------------------------//


// Controller for all posts lists

PostsListController = RouteController.extend({
  template:'posts_list',
  waitOn: function () {
    // take the first segment of the path to get the view, unless it's '/' in which case the view default to 'top'
    var view = this.path == '/' ? 'top' : this.path.split('/')[1];
    var limit = this.params.limit || getSetting('postsPerPage', 10);
    // note: most of the time this.params.slug will be empty
    var parameters = getParameters(view, limit, this.params.slug);
    return [
      Meteor.subscribe('postsList', parameters.find, parameters.options),
      Meteor.subscribe('postsListUsers', parameters.find, parameters.options)
    ]
  },
  data: function () {
    var view = this.path == '/' ? 'top' : this.path.split('/')[1],
        limit = this.params.limit || getSetting('postsPerPage', 10),
        parameters = getParameters(view, limit, this.params.slug),
        posts = Posts.find(parameters.find, parameters.options);
        postsCount = posts.count();
        
    Session.set('postsLimit', limit);

    // get posts and decorate them with rank property
    // note: not actually used; 
    // posts = posts.map(function (post, index) {
    //   post.rank = index;
    //   return post;
    // });

    return {
      postsList: posts,
      postsCount: postsCount
    }
  },
  after: function() {
    var view = this.path == '/' ? 'top' : this.path.split('/')[1];
    Session.set('view', view);
  }    
});

// Controller for post digest

PostsDigestController = RouteController.extend({
  template: 'posts_digest',
  waitOn: function() {
    // if day is set, use that. If not default to today
    var currentDate = this.params.day ? new Date(this.params.year, this.params.month-1, this.params.day) : Session.get('today');
    var parameters = getDigestParameters(currentDate);
    return [
      Meteor.subscribe('postsList', parameters.find, parameters.options),
      Meteor.subscribe('postsListUsers', parameters.find, parameters.options)
    ]
  },
  data: function() {
    var currentDate = this.params.day ? new Date(this.params.year, this.params.month-1, this.params.day) : Session.get('today');
    var parameters = getDigestParameters(currentDate);
    Session.set('currentDate', currentDate);
    return {
      posts: Posts.find(parameters.find, parameters.options)
    }
  }
});

// Controller for post pages

PostPageController = RouteController.extend({
  template: 'post_page',
  waitOn: function () {
    return [
      Meteor.subscribe('singlePost', this.params._id), 
      Meteor.subscribe('postComments', this.params._id),
      Meteor.subscribe('postUsers', this.params._id)
    ];
  },
  data: function () {
    return {postId: this.params._id};
  },
  after: function () {
    window.queueComments = false;
    window.openedComments = [];
    // TODO: scroll to comment position
  } 
});

// Controller for comment pages

CommentPageController = RouteController.extend({
  waitOn: function() {
    return [
      Meteor.subscribe('singleComment', this.params._id),
      Meteor.subscribe('commentUser', this.params._id),
      Meteor.subscribe('commentPost', this.params._id)
    ]
  },
  data: function() {
    return {
      comment: Comments.findOne(this.params._id)
    }
  },
  after: function () {
    window.queueComments = false;
  } 
});

// Controller for user pages

UserPageController = RouteController.extend({
  waitOn: function() {
    return Meteor.subscribe('singleUser', this.params._idOrSlug);
  },
  data: function() {
    var findById = Meteor.users.findOne(this.params._idOrSlug);
    var findBySlug = Meteor.users.findOne({slug: this.params._idOrSlug});
    return {
      user: (typeof findById == "undefined") ? findBySlug : findById
    }
  }
});

//--------------------------------------------------------------------------------------------------//
//--------------------------------------------- Routes ---------------------------------------------//
//--------------------------------------------------------------------------------------------------//

Router.map(function() {

  // Top

  this.route('posts_top', {
    path: '/',
    controller: PostsListController
  });

  this.route('posts_top', {
    path: '/top/:limit?',
    controller: PostsListController
  });

  // New

  this.route('posts_new', {
    path: '/new/:limit?',
    controller: PostsListController
  });

  // Best

  this.route('posts_best', {
    path: '/best/:limit?',
    controller: PostsListController
  });

  // Pending

  this.route('posts_pending', {
    path: '/pending/:limit?',
    controller: PostsListController
  });

  // Categories

  this.route('posts_category', {
    path: '/category/:slug/:limit?',
    controller: PostsListController,
    after: function() {
      Session.set('categorySlug', this.params.slug);
    }
  });

  // TODO: enable /category/new, /category/best, etc. views


  // Digest

  this.route('posts_digest', {
    path: '/digest/:year/:month/:day',
    controller: PostsDigestController
  });
  
  this.route('posts_digest', {
    path: '/digest',
    controller: PostsDigestController
  });

  // -------------------------------------------- Post -------------------------------------------- //


  // Post Page

  this.route('post_page', {
    path: '/posts/:_id',
    controller: PostPageController
  });

  this.route('post_page', {
    path: '/posts/:_id/comment/:commentId',
    controller: PostPageController,
    after: function () {
      // TODO: scroll to comment position
    }
  });

  // Post Edit

  this.route('post_edit', {
    path: '/posts/:_id/edit',
    waitOn: function () {
      return Meteor.subscribe('singlePost', this.params._id);
    },
    data: function() {
      return {postId: this.params._id};
    }
  });

  // Post Submit

  this.route('post_submit', {path: '/submit'});

  // -------------------------------------------- Comment -------------------------------------------- //
  
  // Comment Page

  this.route('comment_page', {
    path: '/comments/:_id',
    controller: CommentPageController
  });

  // Comment Reply

  this.route('comment_reply', {
    path: '/comments/:_id/reply',
    controller: CommentPageController,
    after: function() {
      window.queueComments = false;
    }
  });

  // Comment Edit

  this.route('comment_edit', {
    path: '/comments/:_id/edit',
    controller: CommentPageController,
    after: function() {
      window.queueComments = false;
    }
  });

  // -------------------------------------------- Users -------------------------------------------- //

  // User Profile

  this.route('user_profile', {
    path: '/users/:_idOrSlug',
    controller: UserPageController
  });

  // User Edit

  this.route('user_edit', {
    path: '/users/:_idOrSlug/edit',
    controller: UserPageController
  });

  // Account

  this.route('account', {
    path: '/account',
    template: 'user_edit',
    data: function() {
      return {
        user: Meteor.user()
      }
    }
  });

  // Forgot Password

  this.route('forgot_password');

  // All Users

  this.route('all-users', {
    path: '/all-users/:limit?',
    template: 'users',
    waitOn: function() {
      var limit = parseInt(this.params.limit) || 20,
          parameters = getUsersParameters(this.params.filter, limit);
      return Meteor.subscribe('allUsers', parameters.find, parameters.options);
    },
    data: function() {
      var limit = parseInt(this.params.limit) || 20,
          parameters = getUsersParameters(this.params.filter, limit),
          filter = (typeof this.params.filter === 'string') ? this.params.filter : 'all';
      Session.set('usersLimit', limit);
      return {
        users: Meteor.users.find(parameters.find, parameters.options),
        filter: filter
      }
    }
  });

  // Unsubscribe (from notifications)

  this.route('unsubscribe', {
    path: '/unsubscribe/:hash',
    data: function() {
      return {
        hash: this.params.hash
      }
    }
  });

  // User Sign-Up

  this.route('signup');

  // User Sign-In

  this.route('signin');

  // -------------------------------------------- Other -------------------------------------------- //

  // Categories

  this.route('categories');

  // Settings

  this.route('settings');

  // Toolbox

  this.route('toolbox');

});
