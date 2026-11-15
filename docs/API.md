# API routes

All routes live under `app/api/`. Unless marked **public**, a request needs the signed session cookie (`middleware.ts`). "Role" lists who the route itself allows. Admin and oversight roles are checked against the database on every request.

## Auth

| Route | Methods | Role | Purpose |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | public | Sign in; sets the session cookie. In demo mode, unknown emails become guest astronauts |
| `/api/auth/logout` | POST | any | Clears the session |
| `/api/auth/me` | GET, PATCH | signed in | Current user; PATCH updates the user's own profile setting (body-scan sex) |

## Crew console

| Route | Methods | Role | Purpose |
| --- | --- | --- | --- |
| `/api/dashboard` | GET | signed in | Vitals and crew cards the user may see (own / own crew / every crew) |
| `/api/biometrics/sync` | POST | signed in | Stores queued wearable vitals; returns the ids it saved |
| `/api/health/reports` | POST | signed in | Stores self-checks, routine logs, injuries and period logs from the outbox |
| `/api/chat/messages` | POST | signed in | Stores co-pilot questions and replies for oversight |
| `/api/monitoring/me` | GET | signed in | The user's own monitoring: metrics, trends, missing data, alerts |
| `/api/alerts/[id]` | POST | astronaut, oversight, super admin | Note, acknowledge, resolve or log water on an alert the user may act on |
| `/api/hotline` | GET, POST | astronaut (own thread) · oversight / super admin (inbox) | GET: crew thread (or `?peek=1` for the unread count) or the Earth inbox sorted by urgency. POST: crew sends messages (also from the offline queue) |
| `/api/hotline/[memberId]` | GET, POST | oversight, super admin (assigned groups only) | Read one astronaut's thread; reply, acknowledge or resolve |
| `/api/nasa/studies` | GET | signed in | Cached NASA OSDR research studies |

## Public data

| Route | Methods | Role | Purpose |
| --- | --- | --- | --- |
| `/api/space-weather` | GET | public | NOAA SWPC + NASA DONKI space weather, cached with a bundled fallback |
| `/api/nasa-images` | GET | public | NASA Image Library pictures for backgrounds |

## Oversight

| Route | Methods | Role | Purpose |
| --- | --- | --- | --- |
| `/api/oversight/groups` | GET | oversight, super admin | Groups the user may read |
| `/api/oversight/groups/[id]` | GET | oversight, super admin | One group: every astronaut's latest vitals, logs and alert summary |
| `/api/oversight/members/[id]` | GET | oversight, super admin | One astronaut's full record |
| `/api/oversight/members/[id]/chat` | GET | oversight, super admin | That astronaut's co-pilot transcript |
| `/api/oversight/members/[id]/monitoring` | GET | oversight, super admin | That astronaut's monitoring and alerts |

Outside the user's assigned groups these answer **404**.

## Super admin

| Route | Methods | Role | Purpose |
| --- | --- | --- | --- |
| `/api/admin/groups` | GET, POST | super admin | List or create mission groups |
| `/api/admin/groups/[id]` | PATCH, DELETE | super admin | Edit or delete a group (not while it has members) |
| `/api/admin/users` | GET, POST | super admin | List or create accounts |
| `/api/admin/users/[id]` | PATCH, DELETE | super admin | Edit, reset password, disable/enable or delete an account |
| `/api/admin/users/import` | POST | super admin | CSV import of astronauts into a group |
| `/api/admin/alert-rules` | GET, PATCH | super admin | Read or edit monitoring alert rules (blood pressure limits are validated) |
| `/api/admin/audit` | GET | super admin | Audit log of admin actions |
