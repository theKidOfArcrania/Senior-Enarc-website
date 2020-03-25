import requests
import json

base_url = 'http://localhost:3000/api'

emp_creds = {
    'email': 'adowley0@myspace.com',
    'password': '1893ab19c30d2b4f39a91d514e558f7beb8e4a40ee103024afc56d43c92e4902', 
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


def main():
    sess = requests.Session()
    assert login(sess, emp_creds)
    assert checksess(sess);

    logout(sess);
    assert not checksess(sess);


if __name__ == '__main__':
    main()
