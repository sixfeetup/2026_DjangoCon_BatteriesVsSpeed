# Django Zellit

## Overview

This project is the Django implementation of the reproducible Zellit PostgreSQL
workload. It lives at `research/demo/django/zellit/` and uses CPython 3.12.12.

The scaffold was rendered from the local AlphaKit source at `~/src/alphakit`,
pinned to revision `b9ee939e0fc6765320cd22e29d6be244db30062b`, with:

```shell
copier copy \
  --vcs-ref=b9ee939e0fc6765320cd22e29d6be244db30062b \
  --data project_name=zellit \
  ~/src/alphakit \
  research/demo/django/zellit
```

Later Zellit implementation tasks intentionally customize generated AlphaKit
behavior while retaining its Django foundations and dependency workflow.

## Local Development Setup

This project will use Python 3.12, Docker, and Docker Compose.

### Fast Setup

If you have [just](https://github.com/casey/just) installed, you can run:

```shell
$ just bootstrap
$ just up
```

And be ready to start coding. You also make want to create a superuser with
`just manage createsuperuser`

### Manual Setup

Copy .env-dist to .env and adjust values to match your local environment:

```shell
# setup our local environment variables
$ cp .env-dist .env
```


## Useful Commands to Know

### Just

```shell
# rebuild our services
$ just rebuild

# start services
$ just up

# run migrations
$ just migrate

# create a superuser
$ just manage createsuperuser

# create new migrations
$ just manage makemigrations
```

### Docker Compose

If you don't like using `just` these are alternatives to the above.

```shell
# rebuild our services
$ docker compose build

# start our services
$ docker compose up

# start our services with daemon mode
$ docker compose up -d

# to run database migrations
$ docker compose run --rm utility python manage.py migrate

# to create a superuser
$ docker compose run --rm utility python manage.py createsuperuser

# to create database migrations
$ docker compose run --rm utility python manage.py makemigrations
```

This will create the Docker image, install dependencies, start the services defined in `compose.yml`, and start the web server.

### Cleaning up

To shut down our database and any long-running services, we shut everyone down using:

```shell
$ docker compose down
```

## Running the tests

To run the tests, execute `just test` or:

```shell
$ docker compose run --rm utility pytest
```

## Deploying

TDB

## Production Environment Considerations

TDB
