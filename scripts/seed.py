#!/usr/bin/env python3
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request

APP = os.environ.get('APP_URL', 'http://localhost:3000')
KEYCLOAK = os.environ.get('KEYCLOAK_URL', 'http://localhost:8180')
OPERATOR = ('operator@eventbank.local', 'operator123')


def call(method, url, token=None, body=None, form=None):
    data, headers = None, {}
    if body is not None:
        data, headers['content-type'] = json.dumps(body).encode(), 'application/json'
    if form is not None:
        data, headers['content-type'] = urllib.parse.urlencode(form).encode(), 'application/x-www-form-urlencoded'
    if token:
        headers['authorization'] = f'Bearer {token}'
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request) as response:
            text = response.read().decode()
            return response.status, json.loads(text) if text else None
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        return error.code, json.loads(text) if text.startswith('{') else text
    except (ConnectionError, urllib.error.URLError):
        return 0, None


def wait(check, what, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = check()
        if result:
            return result
        time.sleep(0.5)
    raise SystemExit(f'Gave up waiting for {what}.')


def api(method, path, token, body=None):
    return call(method, f'{APP}/api{path}', token, body)


def token(email, password):
    status, body = call('POST', f'{KEYCLOAK}/realms/eventbank/protocol/openid-connect/token',
                        form={'grant_type': 'password', 'client_id': 'eventbank-cli', 'username': email, 'password': password, 'scope': 'openid'})
    if status != 200:
        raise SystemExit(f'Could not sign in as {email}: {body}')
    return body['access_token']


def create_user(first, last, email, password):
    admin = call('POST', f'{KEYCLOAK}/realms/master/protocol/openid-connect/token',
                 form={'grant_type': 'password', 'client_id': 'admin-cli', 'username': 'admin', 'password': 'admin'})[1]['access_token']
    status, _ = call('POST', f'{KEYCLOAK}/admin/realms/eventbank/users', admin, {
        'username': email, 'email': email, 'firstName': first, 'lastName': last, 'enabled': True, 'emailVerified': True,
        'credentials': [{'type': 'password', 'value': password, 'temporary': False}],
    })
    if status not in (201, 409):
        raise SystemExit(f'Could not create {email}: {status}')


def cpf():
    digits = [random.randint(0, 9) for _ in range(9)]
    for length in (9, 10):
        remainder = sum(d * (length + 1 - i) for i, d in enumerate(digits)) * 10 % 11
        digits.append(0 if remainder == 10 else remainder)
    return ''.join(map(str, digits))


def apply(first, last, birth, phone):
    email, password = f'{first.lower()}@example.com', f'{first.lower()}-pass-123'
    create_user(first, last, email, password)
    access = token(email, password)
    api('POST', '/customers/me', access, {'fullName': f'{first} {last}', 'cpf': cpf(), 'birthDate': birth, 'phone': phone})
    customer = wait(lambda: (lambda r: r[1] if r[0] == 200 else None)(api('GET', '/customers/me', access)), f'{first} application')
    return {'email': email, 'password': password, 'token': access, 'id': customer['id']}


def account_of(customer):
    return wait(lambda: (lambda r: r[1][0] if r[0] == 200 and r[1] else None)(api('GET', '/accounts', customer['token'])), 'account')['id']


def settle_transfer(customer, transfer_id):
    return wait(lambda: (lambda r: r[1]['status'] if r[0] == 200 and r[1]['status'] in ('Completed', 'Failed', 'Reversed') else None)(
        api('GET', f'/transfers/{transfer_id}', customer['token'])), 'transfer')


wait(lambda: call('GET', f'{KEYCLOAK}/realms/eventbank')[0] == 200, 'Keycloak', 180)
wait(lambda: api('GET', '/accounts', None)[0] == 401, 'the gateway', 120)
operator = token(*OPERATOR)

ana = apply('Ana', 'Ribeiro', '1990-05-20', '11987654321')
bruno = apply('Bruno', 'Carvalho', '1988-02-10', '11912345678')
clara = apply('Clara', 'Nunes', '1995-11-30', '21998761234')
diego = apply('Diego', 'Alves', '2001-07-14', '31991112222')

for customer in (ana, bruno):
    api('POST', f"/customers/{customer['id']}/approve", operator)
api('POST', f"/customers/{diego['id']}/reject", operator, {'reason': 'The document photo is unreadable'})

ana['account'], bruno['account'] = account_of(ana), account_of(bruno)
api('POST', f"/accounts/{ana['account']}/deposits", ana['token'], {'amount': 2500})
api('POST', f"/accounts/{bruno['account']}/deposits", bruno['token'], {'amount': 400})

wait(lambda: api('POST', '/pix/keys', ana['token'], {'accountId': ana['account'], 'type': 'Email', 'value': ana['email']})[0] in (201, 422), 'Ana key')
wait(lambda: api('POST', '/pix/keys', bruno['token'], {'accountId': bruno['account'], 'type': 'Email', 'value': bruno['email']})[0] in (201, 422), 'Bruno key')
wait(lambda: api('GET', f"/pix/keys/lookup?key={bruno['email']}", ana['token'])[0] == 200, 'key lookup')

paid = api('POST', '/pix/transfers', ana['token'], {'sourceAccountId': ana['account'], 'key': bruno['email'], 'amount': 300})[1]
declined = api('POST', '/pix/transfers', bruno['token'], {'sourceAccountId': bruno['account'], 'key': ana['email'], 'amount': 5000})[1]
print('PIX Ana to Bruno:', settle_transfer(ana, paid['id']))
print('PIX Bruno to Ana:', settle_transfer(bruno, declined['id']))

wait(lambda: api('POST', '/cards', ana['token'], {'accountId': ana['account']})[0] in (201, 422), 'card')
card = wait(lambda: (lambda r: r[1][0] if r[0] == 200 and r[1] else None)(api('GET', '/cards', ana['token'])), 'card read model')
api('POST', f"/cards/{card['id']}/purchases", ana['token'], {'merchant': 'Padaria Real', 'amount': 42.9})
time.sleep(1.5)
api('PUT', f"/cards/{card['id']}/daily-limit", ana['token'], {'dailyLimit': 100})
time.sleep(1)
api('POST', f"/cards/{card['id']}/purchases", ana['token'], {'merchant': 'Livraria Cultura', 'amount': 80})

print()
print('Customers (password = first name in lowercase + "-pass-123"):')
print('  ana@example.com     approved, BRL account, PIX key, card')
print('  bruno@example.com   approved, BRL account, PIX key')
print('  clara@example.com   waiting for review: approve her in the back office')
print('  diego@example.com   rejected')
print('Operator: operator@eventbank.local / operator123')
print(f'Open {APP} and the e-mails at http://localhost:8025')
