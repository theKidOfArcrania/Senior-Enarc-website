import requests
import json
import hashlib

base_url = 'http://localhost:3000/api/v1'

emp_creds = {
    'email': 'adowley0@myspace.com',
    'password': hashlib.sha256(b'password').hexdigest(), 
}

def login(sess, creds):
    res = json.loads(sess.post(base_url + '/login', json=creds).content)
    print(res['msg'])
    return res['success']

def checksess(sess):
    res = json.loads(sess.get(base_url + '/checksess').content)
    if res['success']:
        print('You are logged in as: ' + res['body']['name'])
    else:
        print('You are not logged in.');
    return res['success']


def logout(sess):
    res = json.loads(sess.post(base_url + '/logout').content)
    print(res['msg'])

def upload(sess, data, fname):
    res = json.loads(sess.post(base_url + '/upload', files={'file': (fname,
        data)}).content)
    print(res['msg'])
    print(res['body']['name'])
    
def main():
    sess = requests.Session()
    assert login(sess, emp_creds)
    assert checksess(sess);

    upload(sess, 'hello!', '/hey/h2@!#$%^%$#34535645647*&^(&*68elloword;\'F:"S"')

    logout(sess);
    assert not checksess(sess);


if __name__ == '__main__':
    main()
