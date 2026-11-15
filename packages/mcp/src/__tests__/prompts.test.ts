import { describe, it, expect } from 'vitest';
import { newProjectPrompt } from '../prompts/new-project.js';
import { addFeaturePrompt } from '../prompts/add-feature.js';

describe('new-project prompt', () => {
  it('includes npm install for express', () => {
    const result = newProjectPrompt({ framework: 'express', name: 'my-app' });
    expect(result).toContain('npm install beebear express');
    expect(result).toContain("import express from 'express'");
    expect(result).toContain("framework: 'express'");
  });

  it('includes npm install for fastify', () => {
    const result = newProjectPrompt({ framework: 'fastify', name: 'my-app' });
    expect(result).toContain('npm install beebear fastify');
    expect(result).toContain("import Fastify from 'fastify'");
  });

  it('includes npm install for hono', () => {
    const result = newProjectPrompt({ framework: 'hono', name: 'my-app' });
    expect(result).toContain('npm install beebear hono');
    expect(result).toContain("import { Hono } from 'hono'");
  });

  it('uses the project name', () => {
    const result = newProjectPrompt({ framework: 'express', name: 'todo-api' });
    expect(result).toContain('mkdir todo-api');
    expect(result).toContain('# Set Up a New beebear Project: todo-api');
  });

  it('includes folder structure creation', () => {
    const result = newProjectPrompt({ framework: 'express', name: 'app' });
    expect(result).toContain('domain/ports/inbound');
    expect(result).toContain('domain/ports/outbound');
    expect(result).toContain('domain/use-cases');
    expect(result).toContain('infrastructure/persistence');
    expect(result).toContain('infrastructure/http');
  });

  it('includes port + use case + container example', () => {
    const result = newProjectPrompt({ framework: 'express', name: 'app' });
    expect(result).toContain("Port<UserRepository>('UserRepository')");
    expect(result).toContain("Port<GetUser>('GetUser')");
    expect(result).toContain('createContainer()');
    expect(result).toContain('container.validate()');
    expect(result).toContain('createHexApp');
    expect(result).toContain('hex.httpAdapter');
  });
});

describe('add-feature prompt', () => {
  it('uses the feature name throughout', () => {
    const result = addFeaturePrompt({
      featureName: 'RegisterUser',
      description: 'Register a new user with email and name',
    });
    expect(result).toContain('# Add Feature: RegisterUser');
    expect(result).toContain("Port<RegisterUser>('RegisterUser')");
    expect(result).toContain('RegisterUserService');
    expect(result).toContain('implements RegisterUser');
  });

  it('includes all 7 steps', () => {
    const result = addFeaturePrompt({
      featureName: 'PlaceOrder',
      description: 'Place an order',
    });
    expect(result).toContain('Step 1');
    expect(result).toContain('Step 2');
    expect(result).toContain('Step 3');
    expect(result).toContain('Step 4');
    expect(result).toContain('Step 5');
    expect(result).toContain('Step 6');
    expect(result).toContain('Step 7');
  });

  it('includes container binding example', () => {
    const result = addFeaturePrompt({
      featureName: 'DeleteUser',
      description: 'Delete a user',
    });
    expect(result).toContain('container.bind(DeleteUser');
    expect(result).toContain('DeleteUserService');
  });
});
