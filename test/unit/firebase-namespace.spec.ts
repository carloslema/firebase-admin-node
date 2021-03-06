/*!
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import {expect} from 'chai';
import * as _ from 'lodash';
import * as chai from 'chai';
import * as nock from 'nock';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';

import * as utils from './utils';
import * as mocks from '../resources/mocks';

import {FirebaseNamespace} from '../../src/firebase-namespace';
import {FirebaseApp} from '../../src/firebase-app';
import {Auth} from '../../src/auth/auth';
import {
  enableLogging,
  Database,
  DataSnapshot,
  OnDisconnect,
  Query,
  Reference,
  ServerValue,
} from '@firebase/database';
import {Messaging} from '../../src/messaging/messaging';
import {Storage} from '../../src/storage/storage';
import {
  Firestore,
  FieldPath,
  FieldValue,
  GeoPoint,
  setLogFunction,
} from '@google-cloud/firestore';

chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);


const DEFAULT_APP_NAME = '[DEFAULT]';
const DEFAULT_APP_NOT_FOUND = 'The default Firebase app does not exist. Make sure you call initializeApp() '
  + 'before using any of the Firebase services.';

describe('FirebaseNamespace', () => {
  let firebaseNamespace: FirebaseNamespace;

  before(() => utils.mockFetchAccessTokenRequests());

  after(() => nock.cleanAll());

  beforeEach(() => {
    firebaseNamespace = new FirebaseNamespace();
  });

  describe('#SDK_VERSION', () => {
    it('should return the SDK version', () => {
      expect(firebaseNamespace.SDK_VERSION).to.equal('<XXX_SDK_VERSION_XXX>');
    });
  });

  describe('#apps', () => {
    it('should return an empty array if there are no apps within this namespace', () => {
      expect(firebaseNamespace.apps).to.deep.equal([]);
    });

    it('should return an array of apps within this namespace', () => {
      const appNames = ['one', 'two', 'three'];
      const apps = appNames.map(appName => {
        return firebaseNamespace.initializeApp(mocks.appOptions, appName);
      });

      expect(firebaseNamespace.apps).to.have.length(apps.length);
      expect(firebaseNamespace.apps).to.deep.equal(apps);
    });

    it('should not include apps which have been deleted', () => {
      const appNames = ['one', 'two', 'three'];
      const apps = appNames.map(appName => {
        return firebaseNamespace.initializeApp(mocks.appOptions, appName);
      });

      return apps[0].delete().then(() => {
        apps.shift();
        expect(firebaseNamespace.apps).to.have.length(apps.length);
        expect(firebaseNamespace.apps).to.deep.equal(apps);
      });
    });

    it('should be read-only', () => {
      expect(() => {
        (firebaseNamespace as any).apps = 'foo';
      }).to.throw(`Cannot set property apps of #<FirebaseNamespace> which has only a getter`);
    });
  });

  describe('#app()', () => {
    const invalidAppNames = [null, NaN, 0, 1, true, false, [], ['a'], {}, { a: 1 }, _.noop];
    invalidAppNames.forEach((invalidAppName) => {
      it('should throw given non-string app name: ' + JSON.stringify(invalidAppName), () => {
        expect(() => {
          return firebaseNamespace.app(invalidAppName as any);
        }).to.throw(`Invalid Firebase app name "${invalidAppName}" provided. App name must be a non-empty string.`);
      });
    });

    it('should throw given empty string app name', () => {
      expect(() => {
        return firebaseNamespace.app('');
      }).to.throw(`Invalid Firebase app name "" provided. App name must be a non-empty string.`);
    });

    it('should throw given an app name which does not correspond to an existing app', () => {
      expect(() => {
        return firebaseNamespace.app(mocks.appName);
      }).to.throw(`Firebase app named "${mocks.appName}" does not exist.`);
    });

    it('should throw given a deleted app', () => {
      const app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      return app.delete().then(() => {
        expect(() => {
          return firebaseNamespace.app(mocks.appName);
        }).to.throw(`Firebase app named "${mocks.appName}" does not exist.`);
      });
    });

    it('should throw given no app name if the default app does not exist', () => {
      expect(() => {
        return firebaseNamespace.app();
      }).to.throw('The default Firebase app does not exist.');
    });

    it('should return the app associated with the provided app name', () => {
      const app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      expect(firebaseNamespace.app(mocks.appName)).to.deep.equal(app);
    });

    it('should return the default app if no app name is provided', () => {
      const app = firebaseNamespace.initializeApp(mocks.appOptions);
      expect(firebaseNamespace.app()).to.deep.equal(app);
    });

    it('should return the default app if the default app name is provided', () => {
      const app = firebaseNamespace.initializeApp(mocks.appOptions);
      expect(firebaseNamespace.app(DEFAULT_APP_NAME)).to.deep.equal(app);
    });
  });

  describe('#initializeApp()', () => {
    const invalidAppNames = [null, NaN, 0, 1, true, false, [], ['a'], {}, { a: 1 }, _.noop];
    invalidAppNames.forEach((invalidAppName) => {
      it('should throw given non-string app name: ' + JSON.stringify(invalidAppName), () => {
        expect(() => {
          firebaseNamespace.initializeApp(mocks.appOptions, invalidAppName as any);
        }).to.throw(`Invalid Firebase app name "${invalidAppName}" provided. App name must be a non-empty string.`);
      });
    });

    it('should throw given empty string app name', () => {
      expect(() => {
        firebaseNamespace.initializeApp(mocks.appOptions, '');
      }).to.throw(`Invalid Firebase app name "" provided. App name must be a non-empty string.`);
    });

    it('should throw given a name corresponding to an existing app', () => {
      expect(() => {
        firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
        firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      }).to.throw(`Firebase app named "${mocks.appName}" already exists.`);
    });

    it('should throw given no app name if the default app already exists', () => {
      expect(() => {
        firebaseNamespace.initializeApp(mocks.appOptions);
        firebaseNamespace.initializeApp(mocks.appOptions);
      }).to.throw('The default Firebase app already exists.');

      expect(() => {
        firebaseNamespace.initializeApp(mocks.appOptions);
        firebaseNamespace.initializeApp(mocks.appOptions, DEFAULT_APP_NAME);
      }).to.throw('The default Firebase app already exists.');

      expect(() => {
        firebaseNamespace.initializeApp(mocks.appOptions, DEFAULT_APP_NAME);
        firebaseNamespace.initializeApp(mocks.appOptions);
      }).to.throw('The default Firebase app already exists.');

      expect(() => {
        firebaseNamespace.initializeApp(mocks.appOptions, DEFAULT_APP_NAME);
        firebaseNamespace.initializeApp(mocks.appOptions, DEFAULT_APP_NAME);
      }).to.throw('The default Firebase app already exists.');
    });

    it('should return a new app with the provided options and app name', () => {
      const app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      expect(app.name).to.equal(mocks.appName);
      expect(app.options).to.deep.equal(mocks.appOptions);
    });

    it('should return an app with the default app name if no app name is provided', () => {
      const app = firebaseNamespace.initializeApp(mocks.appOptions);
      expect(app.name).to.deep.equal(DEFAULT_APP_NAME);
    });

    it('should allow re-use of a deleted app name', () => {
      let app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      return app.delete().then(() => {
        app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
        expect(firebaseNamespace.app(mocks.appName)).to.deep.equal(app);
      });
    });

    it('should add the new app to the namespace\'s app list', () => {
      const app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      expect(firebaseNamespace.app(mocks.appName)).to.deep.equal(app);
    });

    it('should call the "create" app hook for the new app', () => {
      const appHook = sinon.spy();
      firebaseNamespace.INTERNAL.registerService(mocks.serviceName, mocks.firebaseServiceFactory, undefined, appHook);

      const app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);

      expect(appHook).to.have.been.calledOnce.and.calledWith('create', app);
    });
  });

  describe('#INTERNAL.removeApp()', () => {
    const invalidAppNames = [null, NaN, 0, 1, true, false, [], ['a'], {}, { a: 1 }, _.noop];
    invalidAppNames.forEach((invalidAppName) => {
      it('should throw given non-string app name: ' + JSON.stringify(invalidAppName), () => {
        expect(() => {
          firebaseNamespace.INTERNAL.removeApp(invalidAppName as any);
        }).to.throw(`Invalid Firebase app name "${invalidAppName}" provided. App name must be a non-empty string.`);
      });
    });

    it('should throw given empty string app name', () => {
      expect(() => {
        firebaseNamespace.INTERNAL.removeApp('');
      }).to.throw(`Invalid Firebase app name "" provided. App name must be a non-empty string.`);
    });

    it('should throw given an app name which does not correspond to an existing app', () => {
      expect(() => {
        firebaseNamespace.INTERNAL.removeApp(mocks.appName);
      }).to.throw(`Firebase app named "${mocks.appName}" does not exist.`);
    });

    it('should throw given no app name if the default app does not exist', () => {
      expect(() => {
        (firebaseNamespace as any).INTERNAL.removeApp();
      }).to.throw(`No Firebase app name provided. App name must be a non-empty string.`);
    });

    it('should throw given no app name even if the default app exists', () => {
      firebaseNamespace.initializeApp(mocks.appOptions);
      expect(() => {
        (firebaseNamespace as any).INTERNAL.removeApp();
      }).to.throw(`No Firebase app name provided. App name must be a non-empty string.`);
    });

    it('should remove the app corresponding to the provided app name from the namespace\'s app list', () => {
      firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      firebaseNamespace.INTERNAL.removeApp(mocks.appName);
      expect(() => {
        return firebaseNamespace.app(mocks.appName);
      }).to.throw(`Firebase app named "${mocks.appName}" does not exist.`);
    });

    it('should remove the default app from the namespace\'s app list if the default app name is provided', () => {
      firebaseNamespace.initializeApp(mocks.appOptions);
      firebaseNamespace.INTERNAL.removeApp(DEFAULT_APP_NAME);
      expect(() => {
        return firebaseNamespace.app();
      }).to.throw('The default Firebase app does not exist.');
    });

    it('should not be idempotent', () => {
      firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);
      firebaseNamespace.INTERNAL.removeApp(mocks.appName);
      expect(() => {
        firebaseNamespace.INTERNAL.removeApp(mocks.appName);
      }).to.throw(`Firebase app named "${mocks.appName}" does not exist.`);
    });

    it('should call the "delete" app hook for the deleted app', () => {
      const appHook = sinon.spy();
      firebaseNamespace.INTERNAL.registerService(mocks.serviceName, mocks.firebaseServiceFactory, undefined, appHook);

      const app = firebaseNamespace.initializeApp(mocks.appOptions, mocks.appName);

      appHook.reset();

      firebaseNamespace.INTERNAL.removeApp(mocks.appName);

      expect(appHook).to.have.been.calledOnce.and.calledWith('delete', app);
    });
  });

  describe('#INTERNAL.registerService()', () => {
    // TODO(jwenger): finish writing tests for regsiterService() to get more code coverage

    it('should throw given no service name', () => {
      expect(() => {
        firebaseNamespace.INTERNAL.registerService(undefined, mocks.firebaseServiceFactory);
      }).to.throw(`No service name provided. Service name must be a non-empty string.`);
    });

    const invalidServiceNames = [null, NaN, 0, 1, true, false, [], ['a'], {}, { a: 1 }, _.noop];
    invalidServiceNames.forEach((invalidServiceName) => {
      it('should throw given non-string service name: ' + JSON.stringify(invalidServiceName), () => {
        expect(() => {
          firebaseNamespace.INTERNAL.registerService(invalidServiceName as any, mocks.firebaseServiceFactory);
        }).to.throw(`Invalid service name "${invalidServiceName}" provided. Service name must be a non-empty string.`);
      });
    });

    it('should throw given an empty string service name', () => {
      expect(() => {
        firebaseNamespace.INTERNAL.registerService('', mocks.firebaseServiceFactory);
      }).to.throw(`Invalid service name "" provided. Service name must be a non-empty string.`);
    });

    it('should throw given a service name which has already been registered', () => {
      firebaseNamespace.INTERNAL.registerService(mocks.serviceName, mocks.firebaseServiceFactory);
      expect(() => {
        firebaseNamespace.INTERNAL.registerService(mocks.serviceName, mocks.firebaseServiceFactory);
      }).to.throw(`Firebase service named "${mocks.serviceName}" has already been registered.`);
    });

    it('should throw given a service name which has already been registered', () => {
      firebaseNamespace.INTERNAL.registerService(mocks.serviceName, mocks.firebaseServiceFactory);
      expect(() => {
        firebaseNamespace.INTERNAL.registerService(mocks.serviceName, mocks.firebaseServiceFactory);
      }).to.throw(`Firebase service named "${mocks.serviceName}" has already been registered.`);
    });
  });

  describe('#auth()', () => {
    it('should throw when called before initializing an app', () => {
      expect(() => {
        firebaseNamespace.auth();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should throw when default app is not initialized', () => {
      firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      expect(() => {
        firebaseNamespace.auth();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should return a valid namespace when the default app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions);
      let auth: Auth = firebaseNamespace.auth();
      expect(auth.app).to.be.deep.equal(app);
    });

    it('should return a valid namespace when the named app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      let auth: Auth = firebaseNamespace.auth(app);
      expect(auth.app).to.be.deep.equal(app);
    });

    it('should return a reference to Auth type', () => {
      expect(firebaseNamespace.auth.Auth).to.be.deep.equal(Auth);
    });
  });

  describe('#database()', () => {
    it('should throw when called before initializing an app', () => {
      expect(() => {
        firebaseNamespace.database();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should throw when default app is not initialized', () => {
      firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      expect(() => {
        firebaseNamespace.database();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should return a valid namespace when the default app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions);
      let db: Database = firebaseNamespace.database();
      expect(db.app).to.be.deep.equal(app);
      return app.delete();
    });

    it('should return a valid namespace when the named app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      let db: Database = firebaseNamespace.database(app);
      expect(db.app).to.be.deep.equal(app);
      return app.delete();
    });

    it('should return a reference to Database type', () => {
      expect(firebaseNamespace.database.Database).to.be.deep.equal(Database);
    });

    it('should return a reference to DataSnapshot type', () => {
      expect(firebaseNamespace.database.DataSnapshot).to.be.deep.equal(DataSnapshot);
    });

    it('should return a reference to OnDisconnect type', () => {
      expect(firebaseNamespace.database.OnDisconnect).to.be.deep.equal(OnDisconnect);
    });

    it('should return a reference to Query type', () => {
      expect(firebaseNamespace.database.Query).to.be.deep.equal(Query);
    });

    it('should return a reference to Reference type', () => {
      expect(firebaseNamespace.database.Reference).to.be.deep.equal(Reference);
    });

    it('should return a reference to ServerValue type', () => {
      expect(firebaseNamespace.database.ServerValue).to.be.deep.equal(ServerValue);
    });

    it('should return a reference to enableLogging function', () => {
      expect(firebaseNamespace.database.enableLogging).to.be.deep.equal(enableLogging);
    });
  });

  describe('#messaging()', () => {
    it('should throw when called before initializing an app', () => {
      expect(() => {
        firebaseNamespace.messaging();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should throw when default app is not initialized', () => {
      firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      expect(() => {
        firebaseNamespace.messaging();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should return a valid namespace when the default app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions);
      let fcm: Messaging = firebaseNamespace.messaging();
      expect(fcm.app).to.be.deep.equal(app);
    });

    it('should return a valid namespace when the named app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      let fcm: Messaging = firebaseNamespace.messaging(app);
      expect(fcm.app).to.be.deep.equal(app);
    });

    it('should return a reference to Messaging type', () => {
      expect(firebaseNamespace.messaging.Messaging).to.be.deep.equal(Messaging);
    });
  });

  describe('#storage()', () => {
    it('should throw when called before initializing an app', () => {
      expect(() => {
        firebaseNamespace.storage();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should throw when default app is not initialized', () => {
      firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      expect(() => {
        firebaseNamespace.storage();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should return a valid namespace when the default app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions);
      let gcs: Storage = firebaseNamespace.storage();
      expect(gcs.app).to.be.deep.equal(app);
    });

    it('should return a valid namespace when the named app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      let gcs: Storage = firebaseNamespace.storage(app);
      expect(gcs.app).to.be.deep.equal(app);
    });

    it('should return a reference to Storage type', () => {
      expect(firebaseNamespace.storage.Storage).to.be.deep.equal(Storage);
    });
  });

  describe('#firestore()', () => {
    it('should throw when called before initializing an app', () => {
      expect(() => {
        firebaseNamespace.firestore();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should throw when default app is not initialized', () => {
      firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      expect(() => {
        firebaseNamespace.firestore();
      }).to.throw(DEFAULT_APP_NOT_FOUND);
    });

    it('should return a valid namespace when the default app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions);
      let fs: Firestore = firebaseNamespace.firestore();
      expect(fs).to.not.be.null;
    });

    it('should return a valid namespace when the named app is initialized', () => {
      let app: FirebaseApp = firebaseNamespace.initializeApp(mocks.appOptions, 'testApp');
      let fs: Firestore = firebaseNamespace.firestore(app);
      expect(fs).to.not.be.null;
    });

    it('should return a reference to Firestore type', () => {
      expect(firebaseNamespace.firestore.Firestore).to.be.deep.equal(Firestore);
    });

    it('should return a reference to FieldPath type', () => {
      expect(firebaseNamespace.firestore.FieldPath).to.be.deep.equal(FieldPath);
    });

    it('should return a reference to FieldValue type', () => {
      expect(firebaseNamespace.firestore.FieldValue).to.be.deep.equal(FieldValue);
    });

    it('should return a reference to GeoPoint type', () => {
      expect(firebaseNamespace.firestore.GeoPoint).to.be.deep.equal(GeoPoint);
    });

    it('should return a reference to setLogFunction', () => {
      expect(firebaseNamespace.firestore.setLogFunction).to.be.deep.equal(setLogFunction);
    });
  });
});
