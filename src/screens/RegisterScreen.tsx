import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormScreen } from '../components/FormScreen';
import { PhotoPicker } from '../components/PhotoPicker';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import type { PickedImage } from '../types/user';
import { getErrorMessage } from '../utils/errorMessages';
import { isValidPhone, maskDate, maskPhone, parseBirthDate } from '../utils/formatters';
import { spacing } from '../utils/theme';

type FormValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  birthDate: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const INITIAL_VALUES: FormValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  birthDate: '',
};

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.name.trim().length < 2) {
    errors.name = 'Informe seu nome.';
  }
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
    errors.email = 'Informe um e-mail válido.';
  }
  if (values.password.length < 6) {
    errors.password = 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'As senhas não conferem.';
  }
  if (!isValidPhone(values.phoneNumber)) {
    errors.phoneNumber = 'Informe um celular com DDD.';
  }
  if (!parseBirthDate(values.birthDate)) {
    errors.birthDate = 'Informe uma data válida no formato DD/MM/AAAA.';
  }
  return errors;
}

export function RegisterScreen() {
  const { register } = useAuth();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = useMemo(() => (submitted ? validate(values) : {}), [submitted, values]);

  const setField = useCallback((field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    const currentErrors = validate(values);
    const birthDate = parseBirthDate(values.birthDate);
    if (Object.keys(currentErrors).length > 0 || !birthDate) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await register({
        name: values.name,
        email: values.email,
        password: values.password,
        phoneNumber: values.phoneNumber,
        birthDate,
        photo,
      });
      if (result.photoUploadFailed) {
        Alert.alert('Conta criada', 'Não foi possível enviar sua foto agora. Você pode tentar novamente mais tarde.');
      }
    } catch (registerError) {
      setError(getErrorMessage(registerError, 'Não foi possível criar a conta.'));
      setLoading(false);
    }
  }, [photo, register, values]);

  return (
    <FormScreen>
      <PhotoPicker image={photo} name={values.name} variant="user" onChange={setPhoto} disabled={loading} />

      <TextField
        label="Nome"
        value={values.name}
        onChangeText={(text) => setField('name', text)}
        error={errors.name}
        autoComplete="name"
        editable={!loading}
      />
      <TextField
        label="E-mail"
        value={values.email}
        onChangeText={(text) => setField('email', text)}
        error={errors.email}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        editable={!loading}
      />
      <TextField
        label="Senha"
        value={values.password}
        onChangeText={(text) => setField('password', text)}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        editable={!loading}
      />
      <TextField
        label="Confirmar senha"
        value={values.confirmPassword}
        onChangeText={(text) => setField('confirmPassword', text)}
        error={errors.confirmPassword}
        secureTextEntry
        editable={!loading}
      />
      <TextField
        label="Celular"
        value={values.phoneNumber}
        onChangeText={(text) => setField('phoneNumber', maskPhone(text))}
        error={errors.phoneNumber}
        keyboardType="phone-pad"
        placeholder="(11) 91234-5678"
        editable={!loading}
      />
      <TextField
        label="Data de nascimento"
        value={values.birthDate}
        onChangeText={(text) => setField('birthDate', maskDate(text))}
        error={errors.birthDate}
        keyboardType="number-pad"
        placeholder="DD/MM/AAAA"
        editable={!loading}
      />

      {error ? <ErrorMessage message={error} /> : null}

      <View style={styles.actions}>
        <Button title="Criar conta" onPress={handleSubmit} loading={loading} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    marginTop: spacing.md,
  },
});
