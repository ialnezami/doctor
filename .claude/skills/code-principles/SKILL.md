---
name: code-principles
description: Apply SOLID, DRY, YAGNI, and KISS principles when writing or reviewing code
---

# Software Design Principles

## SOLID

**S — Single Responsibility**
A class/module has one reason to change.
- ❌ `class User { validate() save() sendEmail() }`
- ✅ `UserValidator`, `UserRepository`, `UserNotifier` — each separate

**O — Open/Closed**
Open for extension, closed for modification.
Add new behavior via new classes, not by editing existing ones.

**L — Liskov Substitution**
Subtypes must be substitutable for their base types without breaking behavior.

**I — Interface Segregation**
Prefer many small, focused interfaces over one large one.
No class should implement methods it doesn't use.

**D — Dependency Inversion**
Depend on abstractions, not concretions.
Inject dependencies; don't instantiate them inside classes.

## DRY — Don't Repeat Yourself
One source of truth per concept. If you copy logic, extract it.

## YAGNI — You Aren't Gonna Need It
Build what solves today's problem only. No speculative features.

## KISS — Keep It Simple
Choose the simplest solution that works. Add complexity only when evidence demands it.

## Review Checklist
When writing or reviewing code, verify:
- [ ] Each class/function has one clear responsibility
- [ ] No logic is duplicated
- [ ] Dependencies are injected, not hardcoded
- [ ] No speculative abstractions added
- [ ] Cognitive load is manageable (< 7 concepts per unit)