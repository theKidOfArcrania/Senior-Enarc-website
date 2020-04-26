import type * as sess from 'express-session';
import type * as upload from 'express-fileupload';
import type * as mysql from 'mysql';
import type * as filestore from 'session-file-store';

type Config = {
  BCRYPT_ROUNDS: number;
  SESSION_CONFIG: sess.SessionOptions;
  FILE_STORE_CONFIG: filestore.Options;
  IFACE: {
    port: number;
    host: string;
  };
  SQLCREDS: mysql.ConnectionConfig;
  UPLOAD: upload.Options;
  UPLOAD_PATH: string;
  UPLOAD_IDS: string;
  TESTING: boolean;
};

export default Config;
