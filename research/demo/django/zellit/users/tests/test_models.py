from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils import timezone

from ..factories import StaffUserFactory
from ..factories import SuperUserFactory
from ..factories import UserFactory

User = get_user_model()


def test_simple_user_creation(db):
    """Test simple user creation"""
    now = timezone.now()
    f = UserFactory()
    assert f.is_active

    # Ensure LastSeen model is created
    assert f.last_seen.at > now


def test_staff_creation(db):
    """Test simple staff creation"""
    s = StaffUserFactory()
    assert s.is_active
    assert s.is_staff
    assert s.is_superuser is False


def test_superuser_creation(db):
    """Test simple superuser creation"""
    s = SuperUserFactory()
    assert s.is_active
    assert s.is_staff
    assert s.is_superuser


def test_record_login_email(db):
    """Test logging in via email"""
    user = UserFactory()
    now = timezone.now()
    assert user.last_login < now

    User.objects.record_login(email=user.email)
    user = User.objects.get(pk=user.pk)
    assert user.last_login > now


def test_record_login_user(db):
    """Test recordingn last login"""
    user = UserFactory()
    now = timezone.now()
    assert user.last_login < now

    User.objects.record_login(user=user)
    user = User.objects.get(pk=user.pk)
    assert user.last_login > now


def test_create_user(db):
    """Test create_user"""
    u = User.objects.create_user("t1@example.com", "t1pass")
    assert u.is_active
    assert u.is_staff is False
    assert u.is_superuser is False


def test_create_staffuser(db):
    """Test create_staffuser"""
    u = User.objects.create_staffuser("t1@example.com", "t1pass")
    assert u.is_active
    assert u.is_staff

    u = User.objects.create_staffuser("t2@example.com", "t2pass")
    assert u.is_active
    assert u.is_staff
    assert u.is_superuser is False


def test_create_superuser(db):
    """Test create_superuser"""
    u = User.objects.create_superuser("t3@example.com", "t3pass")
    assert u.is_active
    assert u.is_staff
    assert u.is_superuser
