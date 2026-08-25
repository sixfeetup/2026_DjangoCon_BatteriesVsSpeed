# Prep Notes

## Overall Feel
There is no wrong answer here

## Flow
* Each Presenter does intro while we keep the QR code for repo on the screen
* Intro into each framework in the context of this talk by each person
* Transition into more of a podcast format with supporting slides

## Code Differences

Supporting slide with django ninja vs fastapi (minimal change)

Minimal app comparison to showcase the actual lack of changes needed between frameworks to get a similar type of task done.

## Dependency approach

Feature comparison of Ninja vs FastAPI feature sets

Build vs buy of including deps into your project

Both come OOTB with minimal Deps, Django has a rich ecosystem of add-ons, but should you use them.

Illustrate the batteries included via the 

https://django-activity-stream.readthedocs.io/en/latest/index.html

but watch out, DjangoFSM was awesome, but is back via django-fsm-2

What 3rd party FastAPI apps exist?

This is more like the Flask world, due to the kinds of opinions FastAPI holds

FastAPI holds some different batteries included to support your flow

* websockets
* OAuth
* ...

How has AI changed this discussion?

Do we now vendor things into the project to use an existing, but maybe abandoned library

Final thought, these are well supported, they have active communities

## What about async?

Do you really need it?

What is the Async story for each framework

Most people actually don't need it, but if you do, you will know it
When you do, it is probably only in one aspect of your application

slide for the discussion that just says "Async?"

## Benchmark ideas

Intro slide "all benchmarks are BS and biased"

Use Artillery for the benchmarking tests
20 connections vs 200 connections
Docker compose to stand the tests

Zellit -- Zillow crossed with Reddit

* Benchmark against things that don't touch the database to showcase some specific bits

Include a redis call for a cached value
ZIP code lookup
Typeahead API for lookup

* Then benchmark with a simple app that does a small number of queries against the database

SQL reads only against Postgres
Real estate example, averages, demographic data
Select homes in a zip code joined against photos
Activity feed to crazy comments

This all depends on what your actual use-case is

How does this scale up? django vs fastapi as diff connection levels

Django Bolt? discuss as an example path forward for scaling

## Deployment

### Easy Deploy Scenarios
Slide for showing these easy paths

Deployment comparison, OOTB FastAPI vs Django plus stuff
Showcase the FastAPI one-liner deploy to FastAPI cloud

Django Simple Deploy

### Prod/Larger Deploy Scenarios

Show arch diagram from scaf full stack app
Containers on k8s the story really is the same

## Ending Thoughts

End potentially with a discussion of mix and match style deployment because you have some specific needs.
